import { JwtService } from "@nestjs/jwt";
import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, registerUser, withEnv } from "./support/helpers";

const JSON_DOC = "/api-docs-json";
const UI = "/api-docs/";

describe("API documentation", () => {
  let t: TestApp | undefined;
  let restoreEnv: (() => void) | undefined;

  afterEach(async () => {
    await t?.close();
    restoreEnv?.();
    t = undefined;
    restoreEnv = undefined;
  });

  const boot = async (env: Record<string, string>) => {
    restoreEnv = withEnv(env);
    t = await createTestApp({ docs: true });
    return t;
  };

  /**
   * Creates a user and a session token for it. With NODE_ENV=production the session cookie is
   * `Secure`, which the plain-HTTP test client does not send back, so the id is read from the
   * database rather than from /api/users/me.
   */
  const createUser = async (app: TestApp, role: "user" | "admin" = "user") => {
    const { credentials } = await registerUser(app);
    const row = await app.connection.collection("users").findOne({ email: credentials.email });
    const id = String(row!._id);
    if (role === "admin") {
      await app.connection.collection("users").updateOne({ _id: row!._id }, { $set: { role } });
    }
    return { id, token: app.app.get(JwtService).sign({ userId: id }) };
  };

  const withBearer = (app: TestApp, path: string, token: string) =>
    anonymous(app).get(path).set("Authorization", `Bearer ${token}`);

  describe("outside production", () => {
    it("is available without signing in", async () => {
      const app = await boot({});

      const doc = await anonymous(app).get(JSON_DOC);
      expect(doc.status).toBe(200);
      expect(doc.body.openapi).toMatch(/^3\./);
      expect(Object.keys(doc.body.paths)).toContain("/api/hotels");

      expect((await anonymous(app).get(UI)).status).toBe(200);
    });

    it("can be switched off with ENABLE_API_DOCS=false", async () => {
      const app = await boot({ ENABLE_API_DOCS: "false" });

      expect((await anonymous(app).get(JSON_DOC)).status).toBe(404);
      expect((await anonymous(app).get(UI)).status).toBe(404);
    });
  });

  describe("in production", () => {
    const production = { NODE_ENV: "production" };

    it("is disabled unless ENABLE_API_DOCS=true", async () => {
      const app = await boot(production);

      for (const path of [UI, "/api-docs", JSON_DOC, "/api-docs-yaml"]) {
        const res = await anonymous(app).get(path);
        expect(res.status, path).toBe(404);
      }
    });

    it("stays disabled when ENABLE_API_DOCS=false", async () => {
      const app = await boot({ ...production, ENABLE_API_DOCS: "false" });
      expect((await anonymous(app).get(JSON_DOC)).status).toBe(404);
    });

    describe("when enabled", () => {
      const enabled = { ...production, ENABLE_API_DOCS: "true" };

      it("refuses anonymous visitors and invalid sessions", async () => {
        const app = await boot(enabled);

        for (const path of [UI, JSON_DOC, "/api-docs-yaml"]) {
          const res = await anonymous(app).get(path);
          expect(res.status, path).toBe(401);
          expect(res.headers["content-type"]).toMatch(/problem\+json/);
          expect(res.body.code).toBe("UNAUTHENTICATED");
        }

        expect((await withBearer(app, JSON_DOC, "nonsense")).status).toBe(401);
      });

      it("refuses signed-in users who are not admins", async () => {
        const app = await boot(enabled);
        const user = await createUser(app);

        const res = await withBearer(app, JSON_DOC, user.token);

        expect(res.status).toBe(403);
        expect(res.body.code).toBe("FORBIDDEN");
      });

      it("serves the documentation to an admin, by bearer token or session cookie", async () => {
        const app = await boot(enabled);
        const admin = await createUser(app, "admin");

        const viaBearer = await withBearer(app, JSON_DOC, admin.token);
        expect(viaBearer.status).toBe(200);
        expect(viaBearer.body.openapi).toMatch(/^3\./);

        const viaCookie = await anonymous(app).get(UI).set("Cookie", `session_id=${admin.token}`);
        expect(viaCookie.status).toBe(200);
      });

      it("refuses a deactivated admin and a token for a user that does not exist", async () => {
        const app = await boot(enabled);
        const admin = await createUser(app, "admin");
        await app.connection
          .collection("users")
          .updateOne({ _id: new Types.ObjectId(admin.id) }, { $set: { isActive: false } });

        expect((await withBearer(app, JSON_DOC, admin.token)).status).toBe(401);

        const ghost = app.app.get(JwtService).sign({ userId: new Types.ObjectId().toString() });
        expect((await withBearer(app, JSON_DOC, ghost)).status).toBe(401);
      });

      it("refuses a token that carries no user id", async () => {
        const app = await boot(enabled);
        const token = app.app.get(JwtService).sign({ something: "else" });

        expect((await withBearer(app, JSON_DOC, token)).status).toBe(401);
      });

      it("leaves the product API unaffected", async () => {
        const app = await boot(enabled);
        expect((await anonymous(app).get("/api/health")).status).toBe(200);
      });
    });
  });
});
