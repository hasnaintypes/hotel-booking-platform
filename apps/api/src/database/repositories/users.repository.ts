import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import {
  credentials,
  users,
  withTransaction,
  type Credential,
  type Database,
  type NewUser,
  type User,
} from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
import type { CursorRow } from "../../common/pagination/cursor-page";
import { afterDesc, timestampCursorKey } from "../../common/pagination/cursor-sql";
import { isUuid } from "../../common/utils/uuid";
import { DATABASE } from "../postgres.database";

export type UserListFilters = {
  role?: User["role"];
  status?: User["status"];
  /** Matches the account's email or name. */
  q?: string;
};

/** A page request: how many rows, and where the previous page stopped. */
export type UserPageParams = {
  limit: number;
  cursor?: { key: string; id: string };
};

export type NewPasswordAccount = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: "user" | "admin";
  status?: "active" | "suspended";
  emailVerifiedAt?: Date;
  passwordHash: string;
};

export type NewOAuthAccount = {
  email: string;
  firstName: string;
  lastName: string;
  image?: string;
};

export type UserWithCredential = {
  user: User;
  passwordHash: string | null;
};

/**
 * Account storage shared by the identity module and the few other modules that need to know a
 * user's role. Email lookups are case-insensitive to match the `users_email_unique` index.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string): Promise<User | undefined> {
    if (!isUuid(id)) return undefined;
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email.trim()})`)
      .limit(1);
    return user;
  }

  async findForLogin(email: string): Promise<UserWithCredential | undefined> {
    const [row] = await this.db
      .select({ user: users, passwordHash: credentials.passwordHash })
      .from(users)
      .leftJoin(credentials, eq(credentials.userId, users.id))
      .where(sql`lower(${users.email}) = lower(${email.trim()})`)
      .limit(1);
    return row;
  }

  async getCredential(userId: string): Promise<Credential | undefined> {
    if (!isUuid(userId)) return undefined;
    const [credential] = await this.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .limit(1);
    return credential;
  }

  async create(input: NewUser): Promise<User> {
    try {
      const [user] = await this.db.insert(users).values(input).returning();
      return user;
    } catch (error) {
      return throwPostgresError(error);
    }
  }

  /** Creates a password account and its credential in one transaction. */
  async createWithPassword(input: NewPasswordAccount): Promise<User> {
    try {
      return await withTransaction(this.db, async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            role: input.role,
            status: input.status,
            emailVerifiedAt: input.emailVerifiedAt,
          })
          .returning();

        await tx.insert(credentials).values({
          userId: user.id,
          passwordHash: input.passwordHash,
          passwordUpdatedAt: new Date(),
        });

        return user;
      });
    } catch (error) {
      return throwPostgresError(error);
    }
  }

  /**
   * Returns the existing account for an email or creates an OAuth-only one. `ON CONFLICT DO
   * NOTHING` keeps two simultaneous callbacks from creating duplicate accounts.
   */
  async findOrCreateOAuthUser(input: NewOAuthAccount): Promise<User> {
    return withTransaction(this.db, async (tx) => {
      const [existing] = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = lower(${input.email.trim()})`)
        .limit(1);
      if (existing) return existing;

      await tx
        .insert(users)
        .values({
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          image: input.image,
          emailVerifiedAt: new Date(),
        })
        .onConflictDoNothing();

      const [created] = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = lower(${input.email.trim()})`)
        .limit(1);
      return created;
    });
  }

  /** One cursor page of accounts, newest first; filters are applied in SQL. */
  async listPage(filters: UserListFilters, params: UserPageParams): Promise<CursorRow<User>[]> {
    const conditions: SQL[] = [];
    if (filters.role) conditions.push(eq(users.role, filters.role));
    if (filters.status) conditions.push(eq(users.status, filters.status));

    const query = filters.q?.trim();
    if (query) {
      const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      const match = or(
        ilike(users.email, pattern),
        ilike(users.firstName, pattern),
        ilike(users.lastName, pattern),
      );
      if (match) conditions.push(match);
    }
    if (params.cursor) {
      conditions.push(afterDesc(users.createdAt, users.id, params.cursor, "timestamptz"));
    }

    const rows = await this.db
      .select({ user: users, cursorKey: timestampCursorKey(users.createdAt) })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(params.limit + 1);

    return rows.map(({ user, cursorKey }) => ({ ...user, cursorKey }));
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(users);
    return Number(row?.count ?? 0);
  }

  async updateRole(id: string, role: "user" | "admin"): Promise<User | undefined> {
    if (!isUuid(id)) return undefined;
    const [user] = await this.db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateProfile(
    id: string,
    input: { firstName?: string; lastName?: string; phone?: string; image?: string },
  ): Promise<User | undefined> {
    if (!isUuid(id)) return undefined;
    const [user] = await this.db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateImage(id: string, image: string): Promise<void> {
    if (!isUuid(id)) return;
    await this.db.update(users).set({ image, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(credentials)
      .set({ passwordHash, passwordUpdatedAt: new Date(), updatedAt: new Date() })
      .where(eq(credentials.userId, userId));
  }

  async setStatus(id: string, status: "active" | "suspended"): Promise<void> {
    if (!isUuid(id)) return;
    await this.db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async setEmailVerifiedAt(id: string, emailVerifiedAt: Date | null): Promise<void> {
    if (!isUuid(id)) return;
    await this.db
      .update(users)
      .set({ emailVerifiedAt, updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async deleteByEmail(email: string): Promise<void> {
    await this.db.delete(users).where(sql`lower(${users.email}) = lower(${email.trim()})`);
  }

  async deleteById(id: string): Promise<void> {
    if (!isUuid(id)) return;
    await this.db.delete(users).where(eq(users.id, id));
  }
}

export type PublicUser = {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  image?: string;
  phone?: string;
  role: "user" | "admin";
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Maps the PostgreSQL row to the response shape the existing SPAs already consume. */
export const toPublicUser = (user: User): PublicUser => ({
  _id: user.id,
  email: user.email,
  firstName: user.firstName ?? "",
  lastName: user.lastName ?? "",
  ...(user.image ? { image: user.image } : {}),
  ...(user.phone ? { phone: user.phone } : {}),
  role: user.role,
  isActive: user.status === "active",
  emailVerified: user.emailVerifiedAt !== null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});
