import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The correlation context of the work being done right now: an HTTP request, a job handler, or a
 * scheduled run with neither. It is the single source of the request id that logs, outbox rows and
 * outbound provider calls read, so one id traces a booking through the whole platform.
 */
export type RequestContext = {
  requestId: string;
  userId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `context` active, including its asynchronous continuations. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run({ ...context }, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Adds details discovered after the context was created (an authenticated user). Mutates the active
 * store so code that already read it sees the update.
 */
export function enrichRequestContext(patch: Partial<Omit<RequestContext, "requestId">>): void {
  const context = storage.getStore();
  if (!context) return;
  if (patch.userId !== undefined) context.userId = patch.userId;
}

/**
 * The pino `mixin`: every log line written while a context is active carries its request id, so a
 * service logger does not have to pass the id around.
 */
export function requestContextMixin(): { requestId?: string; userId?: string } {
  const context = storage.getStore();
  if (!context) return {};
  return {
    requestId: context.requestId,
    ...(context.userId ? { userId: context.userId } : {}),
  };
}
