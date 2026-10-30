import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

const GROQ_MODELS = ["openai/gpt-oss-20b", "qwen/qwen3.6-27b", "openai/gpt-oss-120b"];

const OPENROUTER_MODELS = ["openai/gpt-4o-mini", "google/gemini-2.0-flash-001"];

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
  constructor(private readonly config: ConfigService) {}

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

  private async callChat(target: ChatTarget, kind: SuggestKind, input: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

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

      if (!res.ok) {
        const errText = await res.text();
        const err = new Error(
          `${target.provider}/${target.model} HTTP ${res.status}: ${errText.slice(0, 160)}`,
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error(`${target.provider}/${target.model} empty response`);
      }
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateDraft(kind: SuggestKind, input: string): Promise<LlmResult> {
    const chain = this.buildChain();
    let usedFallback = false;
    let attempt = 0;

    for (const target of chain) {
      attempt += 1;
      if (attempt > 1) usedFallback = true;
      try {
        const draft = await this.callChat(target, kind, input);
        return {
          draft,
          provider: target.provider,
          model: target.model,
          usedFallback,
        };
      } catch (error) {
        const status = (error as { status?: number }).status;
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          status === undefined || RETRYABLE.has(status) || /abort|network|empty/i.test(message);
        console.warn(`[llm] ${message}${retryable ? " -> next" : " -> next"}`);
        continue;
      }
    }

    return {
      draft: stubDraft(kind, input),
      provider: "stub",
      usedFallback: chain.length > 0,
    };
  }
}
