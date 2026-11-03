import { pgTable, text, timestamp, uniqueIndex, uuid, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/** An external identity linked to a user, such as a Google account. */
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("oauth_accounts_provider_account_unique").on(
      table.provider,
      table.providerAccountId,
    ),
    index("oauth_accounts_user_idx").on(table.userId),
  ],
);

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;
