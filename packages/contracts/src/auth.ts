import { z } from "zod";
import { uuidSchema } from "./primitives";

/**
 * `POST /api/v1/auth/login`. The JWT is delivered as a cookie and stripped from the body, so the
 * account here is a small subset of `publicUserSchema` and uses `id` rather than `_id`.
 */
export const loginResponseSchema = z.object({
  userId: uuidSchema,
  message: z.literal("Login successful"),
  user: z.object({
    id: uuidSchema,
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  }),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;
