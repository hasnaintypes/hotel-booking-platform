import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { lastValueFrom, Observable } from "rxjs";
import {
  IdempotencyRepository,
  type IdempotencyResponseEnvelope,
} from "../../database/repositories/idempotency.repository";
import { DATABASE } from "../../database/postgres.database";
import { runInRequestTransaction } from "../../database/request-transaction";
import type { Database, IdempotencyKey } from "@hotel-booking/db";
import { IDEMPOTENT_METADATA_KEY } from "./idempotent.decorator";
import {
  hashIdempotentRequest,
  IDEMPOTENCY_KEY_HEADER,
  idempotencyScope,
  isValidIdempotencyKey,
} from "./idempotency.utils";

const HOUR_MS = 60 * 60 * 1_000;

const IGNORED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-length",
  "content-type",
  "date",
  "etag",
  "keep-alive",
  "set-cookie",
  "transfer-encoding",
  "vary",
  "x-request-id",
]);

const responseHeaders = (response: Response): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.getHeaders())) {
    const lower = name.toLowerCase();
    if (
      value === undefined ||
      IGNORED_RESPONSE_HEADERS.has(lower) ||
      lower.startsWith("access-control-")
    ) {
      continue;
    }
    headers[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return headers;
};

const applyResponse = (response: Response, envelope: IdempotencyResponseEnvelope): void => {
  response.status(envelope.statusCode);
  for (const [name, value] of Object.entries(envelope.headers ?? {})) {
    response.setHeader(name, value);
  }
};

/**
 * HTTP idempotency: acquire a short lease, execute the handler in one transaction that also stores
 * the response, then replay that response for identical retries. A crashed request leaves an
 * `in_progress` row whose lease expires, allowing a later retry to take over.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: IdempotencyRepository,
    private readonly config: ConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const handler = context.getHandler();
    const operation = Reflect.getMetadata(IDEMPOTENT_METADATA_KEY, handler) as string | undefined;
    if (operation === undefined) return next.handle();

    const request = context.switchToHttp().getRequest<Request & { user?: { userId?: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const rawKey = request.headers[IDEMPOTENCY_KEY_HEADER];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    // The header is optional for backwards compatibility; clients should send it on every retry.
    if (key === undefined) return next.handle();
    if (!isValidIdempotencyKey(key)) {
      throw new BadRequestException("Idempotency-Key must be 1-255 printable characters");
    }

    const scope = idempotencyScope(
      operation || `${context.getClass().name}.${handler.name}`,
      request.user?.userId,
    );
    const requestHash = hashIdempotentRequest({
      method: request.method,
      baseUrl: request.baseUrl,
      route: request.route?.path,
      path: request.path,
      params: request.params,
      query: request.query,
      body: request.body,
    });

    const ttlHours = this.config.get<number>("idempotency.ttlHours") ?? 48;
    const lockTimeoutMs = this.config.get<number>("idempotency.lockTimeoutMs") ?? 30_000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * HOUR_MS);
    const lockedUntil = new Date(now.getTime() + lockTimeoutMs);

    const owner = await this.acquire({
      scope,
      key,
      requestHash,
      expiresAt,
      lockedUntil,
      now,
      response,
    });
    if ("replayed" in owner) return owner.replayed;

    const declaredStatus = Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined;
    const statusCode = typeof declaredStatus === "number" ? declaredStatus : response.statusCode;

    try {
      const envelope = await this.db.transaction(async (tx) => {
        const body = await runInRequestTransaction(tx, () => lastValueFrom(next.handle()));
        const headers = responseHeaders(response);
        const result: IdempotencyResponseEnvelope = {
          statusCode,
          body: body ?? null,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
        };
        await this.repository.complete(owner.record.id, result, owner.record.lockedUntil!, tx);
        return result;
      });

      applyResponse(response, envelope);
      return new Observable((subscriber) => {
        subscriber.next(envelope.body);
        subscriber.complete();
      });
    } catch (error) {
      // The business transaction rolled back, so release the lease for an immediate retry.
      await this.repository
        .release(owner.record.id, owner.record.lockedUntil!)
        .catch(() => undefined);
      throw error;
    }
  }

  private async acquire(input: {
    scope: string;
    key: string;
    requestHash: string;
    expiresAt: Date;
    lockedUntil: Date;
    now: Date;
    response: Response;
  }): Promise<{ record: IdempotencyKey } | { replayed: Observable<unknown> }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const acquired = await this.repository.tryAcquire({
        scope: input.scope,
        key: input.key,
        requestHash: input.requestHash,
        expiresAt: input.expiresAt,
        lockedUntil: input.lockedUntil,
      });
      if (acquired) return { record: acquired };

      const existing = await this.repository.find(input.scope, input.key);
      if (!existing) continue;

      if (existing.expiresAt.getTime() <= input.now.getTime()) {
        await this.repository.deleteById(existing.id);
        continue;
      }

      if (existing.requestHash !== input.requestHash) {
        throw new UnprocessableEntityException(
          "Idempotency-Key was already used with a different request payload",
        );
      }

      if (existing.status === "completed") {
        const envelope = existing.response as unknown as IdempotencyResponseEnvelope | null;
        if (!envelope || typeof envelope !== "object" || !("body" in envelope)) {
          throw new ConflictException("The stored idempotent response is unavailable");
        }
        applyResponse(input.response, envelope);
        return {
          replayed: new Observable((subscriber) => {
            subscriber.next(envelope.body);
            subscriber.complete();
          }),
        };
      }

      if (existing.lockedUntil && existing.lockedUntil.getTime() > input.now.getTime()) {
        this.inFlight(input.response, existing.lockedUntil, input.now);
      }

      const takenOver = await this.repository.takeOver(
        existing.id,
        {
          requestHash: input.requestHash,
          lockedUntil: input.lockedUntil,
          expiresAt: input.expiresAt,
        },
        input.now,
      );
      if (takenOver) return { record: takenOver };

      this.inFlight(input.response, input.lockedUntil, input.now);
    }

    throw new ConflictException("An identical request is already in progress");
  }

  private inFlight(response: Response, lockedUntil: Date, now: Date): never {
    const retryAfter = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1_000));
    response.setHeader("Retry-After", String(retryAfter));
    throw new ConflictException("An identical request is already in progress");
  }
}
