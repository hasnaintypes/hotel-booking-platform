# Logging and error handling (API)

Standards from ADR-023 (logging) and ADR-024 (responses and errors).

## Logging

- **Format:** one JSON object per line on stdout (`LOG_FORMAT=json`, the default outside development). In development the default is `pretty` (`pino-pretty`). Ship logs by collecting stdout; the API never writes log files.
- **Level:** `LOG_LEVEL` = `fatal | error | warn | info | debug | trace | silent`. Defaults: `info` in production, `debug` in development, `silent` in tests.
- **Correlation:** every request gets a `requestId` (a valid incoming `X-Request-Id` is reused, otherwise a UUID is generated). It is returned in the `X-Request-Id` header, appears on every log line written during the request, and in every error response.
- **Access log:** one line per request: `method`, `path` (no query string), `route` (template such as `/api/hotels/:id`), `res.statusCode`, `responseTime`, `userId` (when authenticated), `remoteAddress`, `userAgent`. Level by outcome: 5xx `error`, 4xx `warn`, otherwise `info`. Health checks are not logged.
- **Never logged:** request or response bodies, headers, cookies, authorization values, query strings, passwords, tokens, card data. Credentials embedded in URLs inside error messages or stacks (for example connection strings) are scrubbed. See `src/common/logging/redaction.ts`.

### Writing logs in code

```ts
private readonly logger = new Logger(MyService.name); // adds the context

this.logger.log(`Capture started for booking ${bookingId}`);
this.logger.warn(`Supplier slow: ${supplier} took ${ms} ms`);
this.logger.error("Refund failed", error instanceof Error ? error.stack : undefined);
```

- Use `error` only for faults that need attention, `warn` for degraded or suspicious situations, `info` for business events worth auditing, `debug` for diagnostics.
- Prefer identifiers (`bookingId`, `userId`) over personal data. Do not log whole objects from requests.
- Do not use `console.*` in application code.

### Process safety

Uncaught exceptions and unhandled promise rejections are logged at `fatal`, then the process exits so the platform can restart it. Graceful shutdown (`SIGTERM`) is logged.

## Errors and status codes

All errors are produced by the single global filter (`src/common/errors/global-exception.filter.ts`) as RFC 9457 problem details (`application/problem+json`):

```json
{
  "type": "urn:hotel-booking:problem:conflict",
  "title": "Conflict",
  "status": 409,
  "detail": "User already exists",
  "instance": "/api/users/register",
  "code": "CONFLICT",
  "requestId": "6f1c9a…",
  "errors": [{ "field": "email", "message": "email must be an email" }],
  "message": "User already exists"
}
```

- `code` is the stable machine-readable value; `message` is a compatibility alias of `detail` kept until the SPAs migrate.
- 5xx responses carry a generic `detail`; the real cause is logged server-side with the same `requestId`. No stack traces, SQL, Mongo or Stripe internals reach clients.
- Throw Nest `HttpException` subclasses (`NotFoundException`, `ConflictException`, …) from services. Do not build error bodies in controllers.
- Success status codes: `201` for creates (with the created resource), `204` for empty success (for example logout), `200` otherwise.
- Mapping of body-parser, upload, database, Stripe and unknown errors lives in `exception-mapper.ts` (pure, unit-tested).
