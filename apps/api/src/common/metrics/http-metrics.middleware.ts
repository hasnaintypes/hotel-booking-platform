import type { NextFunction, Request, Response } from "express";
import type { MetricsService } from "./metrics.service";

type RoutedRequest = Request & { route?: { path?: string } };

/**
 * Records one observation per response, including requests rejected by a guard or by the error
 * filter, because it listens on the response rather than wrapping the handler. The route label is
 * the template Express matched, so concrete ids never become label values; anything unmatched is
 * grouped under `unmatched` for the same reason.
 */
export function httpMetricsMiddleware(metrics: MetricsService) {
  return (req: RoutedRequest, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      metrics.observeHttpRequest({
        method: req.method,
        route: req.route?.path ?? "unmatched",
        status: res.statusCode,
        seconds,
      });
    });
    next();
  };
}
