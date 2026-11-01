import type { ConfigService } from "@nestjs/config";
import type { PinoLogger } from "nestjs-pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTEMPT_TIMEOUT_MS, LlmProviderError, LlmService, MAX_ATTEMPTS } from "./llm.service";

// Built from code points so this file contains no invisible characters.
const NUL = String.fromCharCode(0x00);
const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);

const PROMPT = "PROMPT-MARKER-4821";
const OUTPUT = "OUTPUT-MARKER-9137";
const ERROR_BODY = "ERROR-BODY-MARKER-5560";

const settings = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  "ai.groqApiKey": "g-key",
  "ai.openaiApiKey": "o-key",
  "ai.openrouterApiKey": "r-key",
  "ai.deadlineMs": 30_000,
  ...overrides,
});

const configOf = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const okResponse = (content: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }] }),
  text: vi.fn(),
});

const failResponse = (status: number) => ({
  ok: false,
  status,
  json: vi.fn(),
  text: vi.fn(async () => ERROR_BODY),
});

describe("LlmService", () => {
  let logger: Record<"info" | "warn" | "error" | "debug" | "setContext", ReturnType<typeof vi.fn>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  const service = (values = settings()) =>
    new LlmService(configOf(values), logger as unknown as PinoLogger);
  const everythingLogged = () => JSON.stringify(Object.values(logger).map((fn) => fn.mock.calls));

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      setContext: vi.fn(),
    };
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns the first provider's draft when it succeeds", async () => {
    fetchMock.mockResolvedValueOnce(okResponse("A fine hotel."));

    const result = await service().generateDraft("hotel_description", PROMPT);

    expect(result).toMatchObject({ draft: "A fine hotel.", provider: "groq", usedFallback: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the stub without calling anyone when no provider is configured", async () => {
    const result = await service({ "ai.deadlineMs": 30_000 }).generateDraft(
      "hotel_description",
      "cosy inn",
    );

    expect(result).toMatchObject({ provider: "stub", usedFallback: false });
    expect(result.draft).toContain("Cosy inn");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("errors that should move on to the next provider", () => {
    it.each([429, 500, 502, 503])("continues after HTTP %s", async (status) => {
      fetchMock
        .mockResolvedValueOnce(failResponse(status))
        .mockResolvedValueOnce(okResponse("Second."));

      const result = await service().generateDraft("hotel_description", PROMPT);

      expect(result).toMatchObject({ draft: "Second.", usedFallback: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalled();
    });

    it("continues after a network error", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("socket hang up"))
        .mockResolvedValueOnce(okResponse("Next."));

      const result = await service().generateDraft("hotel_description", PROMPT);

      expect(result.draft).toBe("Next.");
    });

    it("continues after an empty answer", async () => {
      fetchMock.mockResolvedValueOnce(okResponse("   ")).mockResolvedValueOnce(okResponse("Real."));

      expect((await service().generateDraft("hotel_description", PROMPT)).draft).toBe("Real.");
    });
  });

  describe("errors that should stop the chain", () => {
    it.each([400, 401, 403])("stops after HTTP %s and serves the stub", async (status) => {
      fetchMock.mockResolvedValue(failResponse(status));

      const result = await service().generateDraft("hotel_description", PROMPT);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ provider: "stub", usedFallback: true });
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ status, outcome: "rejected" }),
        expect.any(String),
      );
    });
  });

  it(`makes at most ${MAX_ATTEMPTS} provider calls however many are configured`, async () => {
    fetchMock.mockResolvedValue(failResponse(500));

    const result = await service().generateDraft("hotel_description", PROMPT);

    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(result.provider).toBe("stub");
  });

  describe("the overall deadline", () => {
    const hangUntilAborted = (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });

    it("gives up when the time is spent instead of trying every provider", async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(hangUntilAborted);

      const pending = service(settings({ "ai.deadlineMs": 2000 })).generateDraft(
        "hotel_description",
        PROMPT,
      );
      await vi.advanceTimersByTimeAsync(2000);
      const result = await pending;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe("stub");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "deadline" }),
        expect.any(String),
      );
    });

    it("never lets one call run longer than the per-call limit", async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(hangUntilAborted);

      const pending = service(settings({ "ai.deadlineMs": 120_000 })).generateDraft(
        "hotel_description",
        PROMPT,
      );
      await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS * MAX_ATTEMPTS);
      await pending;

      expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    });
  });

  describe("untrusted output", () => {
    it("strips control and invisible characters from a provider's draft", async () => {
      fetchMock.mockResolvedValueOnce(okResponse(`Calm${NUL} hotel${RLO} with a${ZWSP} pool.`));

      expect((await service().generateDraft("hotel_description", PROMPT)).draft).toBe(
        "Calm hotel with a pool.",
      );
    });

    it("also cleans the stub, which repeats the user's own text", async () => {
      const result = await service({}).generateDraft("hotel_description", `cosy${NUL} inn${RLO}`);
      expect(result.draft).not.toContain(NUL);
      expect(result.draft).not.toContain(RLO);
    });

    it("caps the length", async () => {
      fetchMock.mockResolvedValueOnce(okResponse("x".repeat(10_000)));
      expect(
        (await service().generateDraft("hotel_description", PROMPT)).draft.length,
      ).toBeLessThanOrEqual(4000);
    });
  });

  describe("privacy", () => {
    it("never logs the prompt, the draft or the provider's error body", async () => {
      const failing = failResponse(500);
      fetchMock.mockResolvedValueOnce(failing).mockResolvedValueOnce(okResponse(OUTPUT));

      await service().generateDraft("hotel_description", PROMPT);

      const logged = everythingLogged();
      expect(logged).not.toContain(PROMPT);
      expect(logged).not.toContain(OUTPUT);
      expect(logged).not.toContain(ERROR_BODY);
      expect(failing.text).not.toHaveBeenCalled();
    });

    it("logs provider, model, attempt, latency and outcome for each attempt", async () => {
      fetchMock.mockResolvedValueOnce(failResponse(429)).mockResolvedValueOnce(okResponse("Fine."));

      await service().generateDraft("hotel_description", PROMPT);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "groq", attempt: 1, status: 429, outcome: "failed" }),
        expect.any(String),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "groq",
          attempt: 2,
          outcome: "ok",
          latencyMs: expect.any(Number),
          model: expect.any(String),
        }),
        expect.any(String),
      );
    });

    it("does not put the prompt in the thrown provider error", () => {
      expect(new LlmProviderError("groq/x HTTP 500", 500).message).not.toContain(PROMPT);
    });
  });
});

describe("LlmProviderError", () => {
  it.each([400, 401, 403])("treats HTTP %s as not retryable", (status) => {
    expect(new LlmProviderError("x", status).retryable).toBe(false);
  });

  it.each([404, 408, 429, 500, 503, undefined])("treats %s as retryable", (status) => {
    expect(new LlmProviderError("x", status).retryable).toBe(true);
  });
});
