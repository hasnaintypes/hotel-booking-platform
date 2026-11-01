import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RateLimitedException } from "../../common/errors/rate-limited.exception";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TRACKED_USERS = 10_000;

type Usage = { minuteStart: number; minuteCount: number; day: number; dayCount: number };

const utcDay = (now: number) => Math.floor(now / DAY_MS);

/**
 * Per-user limits on AI requests: a short rate limit and a daily quota, so one account cannot run
 * up the provider bill. Counters live in this process's memory: they reset when the server
 * restarts and are not shared between instances, which is acceptable at the current single-instance
 * scale (shared state is revisited in M3).
 */
@Injectable()
export class AiUsageLimiter {
  private readonly users = new Map<string, Usage>();

  constructor(private readonly config: ConfigService) {}

  /** Records one request for the user, or throws a 429 with the time to wait. */
  consume(userId: string, now: number = Date.now()): void {
    const perMinute = this.config.get<number>("ai.perMinuteLimit") ?? 5;
    const perDay = this.config.get<number>("ai.dailyQuota") ?? 20;
    const usage = this.usageFor(userId, now);

    if (usage.dayCount >= perDay) {
      const secondsLeft = ((usage.day + 1) * DAY_MS - now) / 1000;
      throw new RateLimitedException(
        "The daily AI quota has been reached. Try again tomorrow.",
        secondsLeft,
      );
    }

    if (now - usage.minuteStart >= MINUTE_MS) {
      usage.minuteStart = now;
      usage.minuteCount = 0;
    }
    if (usage.minuteCount >= perMinute) {
      const secondsLeft = (usage.minuteStart + MINUTE_MS - now) / 1000;
      throw new RateLimitedException("Too many AI requests. Please wait a moment.", secondsLeft);
    }

    usage.minuteCount += 1;
    usage.dayCount += 1;
  }

  private usageFor(userId: string, now: number): Usage {
    const today = utcDay(now);
    let usage = this.users.get(userId);

    if (!usage) {
      this.prune(now, today);
      usage = { minuteStart: now, minuteCount: 0, day: today, dayCount: 0 };
      this.users.set(userId, usage);
    } else if (usage.day !== today) {
      usage.day = today;
      usage.dayCount = 0;
    }

    return usage;
  }

  /** Drops users who have been idle for a day so the map cannot grow without bound. */
  private prune(now: number, today: number) {
    if (this.users.size < MAX_TRACKED_USERS) return;
    for (const [id, usage] of this.users) {
      if (usage.day !== today && now - usage.minuteStart >= MINUTE_MS) this.users.delete(id);
    }
  }
}
