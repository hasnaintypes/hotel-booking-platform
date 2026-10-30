import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LlmService } from "../../integrations/llm/llm.service";
import { SuggestDto } from "./dto/suggest.dto";

@Injectable()
export class AiService {
  constructor(
    private readonly llmService: LlmService,
    private readonly config: ConfigService,
  ) {}

  async suggest(dto: SuggestDto) {
    if (!this.config.get<boolean>("ai.enabled")) {
      throw new ServiceUnavailableException("AI assist is disabled (set AI_ASSIST_ENABLED=true)");
    }

    const result = await this.llmService.generateDraft(dto.kind, String(dto.input || ""));

    return {
      draft: result.draft,
      provider: result.provider,
      model: result.model,
      usedFallback: result.usedFallback,
    };
  }
}
