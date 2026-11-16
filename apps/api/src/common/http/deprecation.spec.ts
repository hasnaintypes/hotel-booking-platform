import { Controller, Get, type INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Deprecated } from "./deprecation.decorator";
import { DeprecationInterceptor } from "./deprecation.interceptor";

const SINCE = new Date("2026-11-01T00:00:00.000Z");
const SUNSET = new Date("2027-01-01T00:00:00.000Z");

@Controller("fixture")
class FixtureController {
  @Get("retiring")
  @Deprecated({ since: SINCE, sunset: SUNSET, replacement: "/api/v2/things" })
  retiring() {
    return { ok: true };
  }

  @Get("current")
  current() {
    return { ok: true };
  }
}

describe("DeprecationInterceptor", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FixtureController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new DeprecationInterceptor(app.get(Reflector)));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("announces the retirement with RFC 9745/8594 headers", async () => {
    const res = await request(app.getHttpServer()).get("/fixture/retiring").expect(200);

    expect(res.headers.deprecation).toBe(`@${Math.floor(SINCE.getTime() / 1_000)}`);
    expect(res.headers.sunset).toBe(SUNSET.toUTCString());
    expect(res.headers.link).toBe('</api/v2/things>; rel="successor-version"');
  });

  it("omits the sunset and link headers when no date or replacement is known", async () => {
    @Controller("partial")
    class PartialController {
      @Get()
      @Deprecated({ since: SINCE })
      get() {
        return { ok: true };
      }
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [PartialController],
    }).compile();
    const partial = moduleRef.createNestApplication();
    partial.useGlobalInterceptors(new DeprecationInterceptor(partial.get(Reflector)));
    await partial.init();

    try {
      const res = await request(partial.getHttpServer()).get("/partial").expect(200);
      expect(res.headers.deprecation).toBeDefined();
      expect(res.headers.sunset).toBeUndefined();
      expect(res.headers.link).toBeUndefined();
    } finally {
      await partial.close();
    }
  });

  it("leaves routes that are not deprecated untouched", async () => {
    const res = await request(app.getHttpServer()).get("/fixture/current").expect(200);

    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.sunset).toBeUndefined();
  });
});
