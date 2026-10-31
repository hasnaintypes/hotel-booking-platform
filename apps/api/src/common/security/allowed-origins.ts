import { ConfigService } from "@nestjs/config";

const LOCAL_ORIGINS = ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"];

export const getAllowedOrigins = (config: ConfigService): string[] =>
  [
    config.get<string>("frontendUrl"),
    config.get<string>("adminUrl"),
    config.get<string>("backendUrl"),
    ...LOCAL_ORIGINS,
  ].filter((origin): origin is string => Boolean(origin));

export const isAllowedOrigin = (origin: string, config: ConfigService): boolean =>
  getAllowedOrigins(config).includes(origin);
