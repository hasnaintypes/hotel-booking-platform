import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { users, type Database, type NewUser, type User } from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
import { DATABASE } from "../postgres.database";

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async create(input: NewUser): Promise<User> {
    try {
      const [user] = await this.db.insert(users).values(input).returning();
      return user;
    } catch (error) {
      return throwPostgresError(error);
    }
  }

  async deleteByEmail(email: string): Promise<void> {
    await this.db.delete(users).where(eq(users.email, email));
  }
}
