import { z } from "zod";
import { cursorPageSchema } from "./pagination";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

export const USER_ROLE_VALUES = ["user", "admin"] as const;
export const USER_STATUS_VALUES = ["active", "suspended"] as const;

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
