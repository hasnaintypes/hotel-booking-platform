import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RateLimitedException } from "../../common/errors/rate-limited.exception";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_ACCOUNTS = 10_000;

type Attempts = { count: number; windowStart: number };

/**
 * Locks an account for a while after too many failed sign-ins, so a password cannot be guessed
 * by trying it against one account again and again. Unknown email addresses are counted too, so
 * the response never reveals whether an account exists.
 *
 * Counters live in this process's memory: they reset when the server restarts and are not shared
 * between instances, which is acceptable at the current single-instance scale. The lock is
 * temporary because anyone who knows an email address can trigger it.
 */
@Injectable()
export class LoginAttemptTracker {
  private readonly accounts = new Map<string, Attempts>();

  constructor(private readonly config: ConfigService) {}

  private get maxFailures(): number {
    return this.config.get<number>("auth.maxFailedLogins") ?? 5;
  }

  private keyOf(email: string) {
    return email.trim().toLowerCase();
  }

  /** Throws a 429 with the time to wait when the account is locked. */
  assertNotLocked(email: string, now: number = Date.now()): void {
    const attempts = this.accounts.get(this.keyOf(email));
    if (!attempts) return;

    if (now - attempts.windowStart >= WINDOW_MS) {
      this.accounts.delete(this.keyOf(email));
      return;
    }

    if (attempts.count >= this.maxFailures) {
      throw new RateLimitedException(
        "Too many failed sign-in attempts. Please try again later.",
        (attempts.windowStart + WINDOW_MS - now) / 1000,
      );
    }
  }

  recordFailure(email: string, now: number = Date.now()): void {
    const key = this.keyOf(email);
    const existing = this.accounts.get(key);

    if (!existing || now - existing.windowStart >= WINDOW_MS) {
      this.prune(now);
      this.accounts.set(key, { count: 1, windowStart: now });
    } else {
      existing.count += 1;
    }
  }

  clear(email: string): void {
    this.accounts.delete(this.keyOf(email));
  }

  private prune(now: number) {
    if (this.accounts.size < MAX_TRACKED_ACCOUNTS) return;
    for (const [key, attempts] of this.accounts) {
      if (now - attempts.windowStart >= WINDOW_MS) this.accounts.delete(key);
    }
  }
}
