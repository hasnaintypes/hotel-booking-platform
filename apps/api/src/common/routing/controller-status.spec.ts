import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { HTTP_CODE_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { CONTROLLERS } from "./controllers";

const MUTATING = new Set<RequestMethod>([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

/**
 * ADR-024: a mutating handler states its status explicitly, so a change of default or an
 * accidental 200 with an empty body is caught in review and by CI.
 */
describe("explicit status codes", () => {
  it("requires @HttpCode on every mutating handler", () => {
    const missing: string[] = [];
    for (const controller of CONTROLLERS) {
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (typeof handler !== "function" || name === "constructor") continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined || !MUTATING.has(method)) continue;
        if (Reflect.getMetadata(HTTP_CODE_METADATA, handler) === undefined) {
          missing.push(`${controller.name}.${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
