import type { IncomingMessage, ServerResponse } from "node:http";
import { stdSerializers, stdTimeFunctions } from "pino";
import type { Options } from "pino-http";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id";
import { pathOnly, REDACT_CENSOR, REDACT_PATHS, scrubSecrets } from "./redaction";

export type LoggingSettings = {
  level: string;
  format: "json" | "pretty";
  service: string;
  environment: string;
};

type RequestWithContext = IncomingMessage & {
  id?: string;
  route?: { path?: string };
  user?: { userId?: string };
  originalUrl?: string;
};

const HEALTH_PATH = /^\/(api\/)?health(\/|$)/;

/**
 * Builds the pino-http options: one structured access-log line per request,
 * correlated by `requestId`, without request bodies, headers or query strings.
 */
export function buildPinoHttpOptions(
  settings: LoggingSettings,
  destination?: NodeJS.WritableStream | null,
): Options {
  const options: Options = {
    level: settings.level,
    base: { service: settings.service, env: settings.environment },
    timestamp: stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },

    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
      res.setHeader("X-Request-Id", id);
      return id;
    },
    // The request logger only binds the id (as `requestId`); method, path and route are
    // added to the single completion line below.
    quietReqLogger: true,
    // Without this the completion line would also carry the full request (query string, headers).
    quietResLogger: true,
    customAttributeKeys: { reqId: "requestId" },

    serializers: {
      // Error messages and stacks can embed connection strings or tokens.
      err: (error: Error) => {
        const serialized = stdSerializers.err(error) as Record<string, unknown>;
        for (const key of ["message", "stack"]) {
          if (typeof serialized[key] === "string")
            serialized[key] = scrubSecrets(serialized[key] as string);
        }
        return serialized;
      },
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
    customProps: (req: IncomingMessage, res: ServerResponse) => {
      const request = req as RequestWithContext;
      // pino-http calls this at request start and again on completion; only the
      // completion call has a response and a resolved route.
      if (!res.writableEnded) return {};
      return {
        method: request.method,
        path: pathOnly(request.originalUrl ?? request.url),
        route: request.route?.path,
        userId: request.user?.userId,
        remoteAddress: request.socket?.remoteAddress,
        userAgent: request.headers["user-agent"],
      };
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customSuccessMessage: (req, res) => `${req.method} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${res.statusCode} failed`,
    autoLogging: {
      ignore: (req: IncomingMessage) => HEALTH_PATH.test(pathOnly(req.url)),
    },
  };

  if (destination) {
    (options as { stream?: NodeJS.WritableStream }).stream = destination;
  } else if (settings.format === "pretty") {
    options.transport = {
      target: "pino-pretty",
      options: {
        singleLine: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname,service,env",
      },
    };
  }

  return options;
}
