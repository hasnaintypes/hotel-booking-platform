import { Global, Injectable, Module } from "@nestjs/common";

/**
 * Injectable time source for background work. Production uses the system clock; tests can freeze
 * or advance it to exercise TTLs and staleness thresholds without sleeping.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol("CLOCK");

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** One process-wide clock so tests can override time for jobs, offers and bookings together. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
