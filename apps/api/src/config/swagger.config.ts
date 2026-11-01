import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { getConnectionToken } from "@nestjs/mongoose";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import type { Connection } from "mongoose";
import { extractToken } from "../common/guards/jwt-auth.guard";
import { PROBLEM_CONTENT_TYPE, problemType } from "../common/errors/problem";
import type { JwtPayload } from "../common/types/jwt-payload.interface";

/** Where the interactive docs and the raw documents are served. */
export const DOCS_PATHS = ["/api-docs", "/api-docs-json", "/api-docs-yaml"];

const deny = (req: Request, res: Response, status: 401 | 403) => {
  const code = status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN";
  res
    .status(status)
    .type(PROBLEM_CONTENT_TYPE)
    .send(
      JSON.stringify({
        type: problemType(code),
        title: status === 401 ? "Unauthorized" : "Forbidden",
        status,
        detail:
          status === 401
            ? "Sign in as an administrator to view the API documentation."
            : "The API documentation is available to administrators only.",
        instance: req.path,
        code,
      }),
    );
};

/** Lets only a signed-in, active administrator through. */
const adminOnly = (app: INestApplication) => {
  const jwt = app.get(JwtService);
  const connection = app.get<Connection>(getConnectionToken());

  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) return deny(req, res, 401);

    let userId: unknown;
    try {
      userId = jwt.verify<JwtPayload>(token).userId;
    } catch {
      return deny(req, res, 401);
    }
    if (typeof userId !== "string") return deny(req, res, 401);

    try {
      const user = (await connection.model("User").findById(userId).select("role isActive")) as {
        role?: string;
        isActive?: boolean;
      } | null;
      if (!user || user.isActive === false) return deny(req, res, 401);
      if (user.role !== "admin") return deny(req, res, 403);
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Mounts the API documentation when it is enabled (`apiDocs.enabled`: on outside production, off
 * in production unless ENABLE_API_DOCS=true). In production it is served only to admins, because
 * it describes every route. Returns whether the docs were mounted.
 */
export const setupSwagger = (app: INestApplication, config: ConfigService): boolean => {
  if (!config.get<boolean>("apiDocs.enabled")) return false;

  const backendUrl = config.get<string>("backendUrl");
  const port = config.get<number>("port");
  const isProduction = config.get<string>("nodeEnv") === "production";

  const servers = [{ url: backendUrl, description: "API Server" }];
  const localUrl = `http://localhost:${port}`;
  if (!isProduction && backendUrl !== localUrl) {
    servers.push({ url: localUrl, description: "Local development" });
  }

  if (isProduction) {
    app.use(DOCS_PATHS, adminOnly(app));
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Hotel Booking API")
    .setDescription("A comprehensive API for hotel booking and management system")
    .setVersion("1.0.0")
    .setContact("API Support", "", "support@HolidayHotel.com")
    .addCookieAuth("session_id", { type: "apiKey", in: "cookie" }, "jwt")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  document.servers = servers;

  SwaggerModule.setup("api-docs", app, document, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Hotel Booking API Documentation",
  });

  return true;
};
