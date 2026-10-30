import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export const setupSwagger = (app: INestApplication, config: ConfigService) => {
  const backendUrl = config.get<string>("backendUrl");
  const port = config.get<number>("port");

  const servers = [{ url: backendUrl, description: "API Server" }];
  const localUrl = `http://localhost:${port}`;
  if (config.get<string>("nodeEnv") !== "production" && backendUrl !== localUrl) {
    servers.push({ url: localUrl, description: "Local development" });
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
};
