import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import { sanitizeDraft } from "./sanitize-draft";

export type SuggestKind = "hotel_description" | "insights_copy";

export type LlmResult = {
  draft: string;
  provider: "groq" | "openai" | "openrouter" | "stub";
  model?: string;
  usedFallback?: boolean;
};

type ChatTarget = {
  provider: "groq" | "openai" | "openrouter";
  baseUrl: string;
  apiKey: string;
  model: string;
};

const GROQ_MODELS = ["openai/gpt-oss-20b", "qwen/qwen3.6-27b", "openai/gpt-oss-120b"];

const OPENROUTER_MODELS = ["openai/gpt-4o-mini", "google/gemini-2.0-flash-001"];

/** Providers tried per request, however many are configured. */
export const MAX_ATTEMPTS = 3;
/** Longest a single provider call may take, within the request's overall deadline. */
export const ATTEMPT_TIMEOUT_MS = 25_000;
/**
 * A provider answering one of these means our request or credentials are wrong, not that the
 * provider is busy, so trying the next provider cannot be relied on to help and only adds cost.
 */
const NON_RETRYABLE_STATUSES = [400, 401, 403];

/** A failed provider call. The message never includes the provider's response body. */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmProviderError";
  }

  get retryable(): boolean {
    return this.status === undefined || !NON_RETRYABLE_STATUSES.includes(this.status);
  }
}

const systemPrompt = (kind: SuggestKind) =>
  kind === "insights_copy"
    ? "You write short hotel-business insight blurbs (2-3 sentences) for an admin dashboard. No markdown."
    : "You polish hotel listing descriptions for a booking site. Keep 2-4 sentences, inviting, no markdown, GBP market tone.";

const userPrompt = (kind: SuggestKind, input: string) =>
  kind === "insights_copy"
    ? `Summarize insights from this context:\n${input}`
    : `Polish this hotel description:\n${input}`;

export const stubDraft = (kind: SuggestKind, input: string): string => {
  const cleaned = (input || "").trim() || "this property";
  if (kind === "insights_copy") {
    return (
      `Business snapshot: ${cleaned}. Bookings and revenue trends look healthy for a boutique portfolio. ` +
      `Focus on converting pending stays and highlighting top-rated destinations in the next campaign.`
    );
  }
  return (
    `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}. ` +
    `Guests enjoy refined rooms, thoughtful amenities, and a convenient location for leisure and business travel. ` +
    `Book your stay for warm hospitality and a memorable city escape.`
  );
};

@Injectable()
export class LlmService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    // Not @InjectPinoLogger(name): that provider is only created for classes loaded before the
    // logging module is configured, which this one is not.
    this.logger.setContext(LlmService.name);
  }

  private buildChain(): ChatTarget[] {
    const chain: ChatTarget[] = [];
    const groqApiKey = this.config.get<string>("ai.groqApiKey");
    const openaiApiKey = this.config.get<string>("ai.openaiApiKey");
    const openrouterApiKey = this.config.get<string>("ai.openrouterApiKey");

    if (groqApiKey) {
      const override = this.config.get<string>("ai.groqModel")?.trim();
      const models = override ? [override] : GROQ_MODELS;
      for (const model of models) {
        chain.push({
          provider: "groq",
          baseUrl: "https://api.groq.com/openai/v1",
          apiKey: groqApiKey,
          model,
        });
      }
    }

    if (openaiApiKey) {
      chain.push({
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: openaiApiKey,
        model: this.config.get<string>("ai.openaiModel") || "gpt-4o-mini",
      });
    }

    if (openrouterApiKey) {
      const override = this.config.get<string>("ai.openrouterModel")?.trim();
      const models = override ? [override] : OPENROUTER_MODELS;
      for (const model of models) {
        chain.push({
          provider: "openrouter",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: openrouterApiKey,
          model,
        });
      }
    }

    return chain;
  }

  private async callChat(
    target: ChatTarget,
    kind: SuggestKind,
    input: string,
    timeoutMs: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${target.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${target.apiKey}`,
          "Content-Type": "application/json",
          ...(target.provider === "openrouter"
            ? {
                "HTTP-Referer": this.config.get<string>("frontendUrl") || "http://localhost:5174",
                "X-Title": "Hotel Booking AI Assist",
              }
            : {}),
        },
        body: JSON.stringify({
          model: target.model,
          temperature: 0.7,
          messages: [
            { role: "system", content: systemPrompt(kind) },
            { role: "user", content: userPrompt(kind, input) },
          ],
        }),
      });

      // The response body of a failure is deliberately never read or logged: it can echo the
      // prompt back.
      if (!res.ok) {
        throw new LlmProviderError(
          `${target.provider}/${target.model} HTTP ${res.status}`,
          res.status,
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new LlmProviderError(`${target.provider}/${target.model} empty response`);
      }
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Tries configured providers in order, within one overall deadline and at most MAX_ATTEMPTS
   * calls. Falls back to a local stub draft when none succeeds. Logs the provider, model, latency
   * and outcome of each attempt, never the prompt or the output.
   */
  async generateDraft(kind: SuggestKind, input: string): Promise<LlmResult> {
    const chain = this.buildChain();
    const deadlineMs = this.config.get<number>("ai.deadlineMs") ?? 30_000;
    const startedAt = Date.now();
    let attempts = 0;
    let stoppedBecause: string | undefined;

    for (const target of chain) {
      if (attempts >= MAX_ATTEMPTS) {
        stoppedBecause = "max_attempts";
        break;
      }
      const remainingMs = deadlineMs - (Date.now() - startedAt);
      if (remainingMs <= 0) {
        stoppedBecause = "deadline";
        break;
      }

      attempts += 1;
      const attemptStartedAt = Date.now();
      const details = { provider: target.provider, model: target.model, attempt: attempts };

      try {
        const draft = await this.callChat(
          target,
          kind,
          input,
          Math.min(ATTEMPT_TIMEOUT_MS, remainingMs),
        );
        this.logger.info(
          { ...details, latencyMs: Date.now() - attemptStartedAt, outcome: "ok" },
          "AI draft generated",
        );
        return {
          draft: sanitizeDraft(draft),
          provider: target.provider,
          model: target.model,
          usedFallback: attempts > 1,
        };
      } catch (error) {
        const failure = error instanceof LlmProviderError ? error : undefined;
        const retryable = failure ? failure.retryable : true;
        const fields = {
          ...details,
          latencyMs: Date.now() - attemptStartedAt,
          status: failure?.status,
          outcome: retryable ? "failed" : "rejected",
        };

        if (retryable) {
          this.logger.warn(fields, "AI provider attempt failed; trying the next provider");
          continue;
        }

        this.logger.error(fields, "AI provider rejected the request; not trying other providers");
        stoppedBecause = "non_retryable";
        break;
      }
    }

    if (chain.length > 0) {
      this.logger.warn(
        { attempts, reason: stoppedBecause ?? "all_failed" },
        "AI draft served from the local stub",
      );
    }

    return {
      draft: sanitizeDraft(stubDraft(kind, input)),
      provider: "stub",
      usedFallback: chain.length > 0,
    };
  }
}
