import { z } from "zod";
import { optionalBody } from "./body";
import { cursorPageSchema } from "./pagination";
import {
  COMMON_PASSWORD_MESSAGE,
  isCommonPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_MESSAGE,
} from "./passwords";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

export const USER_ROLE_VALUES = ["user", "admin"] as const;
export const USER_STATUS_VALUES = ["active", "suspended"] as const;

/**
 * Login keeps the original rule: accounts created before the current policy may have a password
 * that is shorter than what registration now demands, and they must still be able to sign in.
 */
export const LOGIN_PASSWORD_MIN_LENGTH = 6;

/**
 * The account shape every authenticated response uses. Password, address and preferences are
 * internal columns and never cross the wire.
 */
export const publicUserSchema = z.object({
  _id: uuidSchema,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  image: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(USER_ROLE_VALUES),
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** One row of `GET /api/v1/admin/users`, with the spend the admin dashboard shows. */
export const adminUserListItemSchema = publicUserSchema.extend({
  totalBookings: z.number().int(),
  totalSpent: z.number(),
});

export const adminUserPageSchema = cursorPageSchema(adminUserListItemSchema);

export type UserRole = (typeof USER_ROLE_VALUES)[number];
export type UserStatus = (typeof USER_STATUS_VALUES)[number];
export type PublicUser = z.infer<typeof publicUserSchema>;
export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;
export type AdminUserPage = z.infer<typeof adminUserPageSchema>;

/** `POST /api/v1/auth/login`. */
export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(LOGIN_PASSWORD_MIN_LENGTH),
});

const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: PASSWORD_MIN_MESSAGE })
  .max(PASSWORD_MAX_LENGTH, { error: PASSWORD_MAX_MESSAGE });

/**
 * `POST /api/v1/auth/register`. The email-name rule needs the whole body, so it is a refinement on
 * the object that reports its issue on the `password` field.
 */
export const registerRequestSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.email(),
    password: newPasswordSchema,
    phone: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (typeof value.password !== "string") return;
    if (!isCommonPassword(value.password, value.email)) return;
    ctx.addIssue({ code: "custom", path: ["password"], message: COMMON_PASSWORD_MESSAGE });
  });

/** `PATCH /api/v1/me`; every field is optional and an absent one is left unchanged. */
export const updateProfileRequestSchema = optionalBody(
  z.object({
    firstName: z.string().max(80).optional(),
    lastName: z.string().max(80).optional(),
    phone: z.string().max(40).optional(),
    // The profile picture is uploaded elsewhere, so a protocol is mandatory and only a loadable
    // scheme is accepted.
    image: z
      .url({ protocol: /^(https?|ftp)$/, hostname: z.regexes.domain })
      .max(2048)
      .optional(),
  }),
);

/** `PATCH /api/v1/admin/users/:id`. */
export const updateRoleRequestSchema = z.object({
  role: z.enum(USER_ROLE_VALUES, {
    error: `role must be one of: ${USER_ROLE_VALUES.join(", ")}`,
  }),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;
