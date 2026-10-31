const stripTrailingSlash = (value?: string) => (value ? value.replace(/\/$/, "") : value);

export const configuration = () => {
  const port = parseInt(process.env.PORT || "5001", 10);

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port,
    frontendUrl: stripTrailingSlash(process.env.FRONTEND_URL) || "http://localhost:5174",
    adminUrl: stripTrailingSlash(process.env.ADMIN_URL) || "http://localhost:5175",
    backendUrl: stripTrailingSlash(process.env.BACKEND_URL) || `http://localhost:${port}`,
    mongodb: {
      uri: process.env.MONGODB_CONNECTION_STRING,
    },
    jwt: {
      secret: process.env.JWT_SECRET_KEY,
      expiresIn: "1d",
    },
    google: {
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
    stripe: {
      apiKey: process.env.STRIPE_API_KEY,
    },
    ai: {
      enabled: process.env.AI_ASSIST_ENABLED === "true",
      groqApiKey: process.env.GROQ_API_KEY,
      groqModel: process.env.GROQ_MODEL,
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_MODEL,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      openrouterModel: process.env.OPENROUTER_MODEL,
    },
  };
};

export type AppConfig = ReturnType<typeof configuration>;
