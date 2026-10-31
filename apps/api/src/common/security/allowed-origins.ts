import { ConfigService } from "@nestjs/config";

const LOCAL_ORIGINS = ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"];

export const getAllowedOrigins = (config: ConfigService): string[] =>
  [config.get<string>("frontendUrl"), config.get<string>("backendUrl"), ...LOCAL_ORIGINS].filter(
    (origin): origin is string => Boolean(origin),
  );

export const isAllowedOrigin = (origin: string, config: ConfigService): boolean => {
  if (origin.includes("netlify.app") || origin.includes("vercel.app")) {
    return true;
  }

  return getAllowedOrigins(config).includes(origin);
};
