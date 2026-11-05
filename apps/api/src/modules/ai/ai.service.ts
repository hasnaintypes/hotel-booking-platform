import { ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UsersRepository } from "../../database/repositories/users.repository";
import { LlmService } from "../../integrations/llm/llm.service";
import { AiUsageLimiter } from "./ai-usage-limiter";
import { SuggestDto } from "./dto/suggest.dto";

@Injectable()
export class AiService {
  constructor(
    private readonly llmService: LlmService,
    private readonly config: ConfigService,
    private readonly limiter: AiUsageLimiter,
    private readonly users: UsersRepository,
  ) {}

  /**
   * Any signed-in user may draft a hotel description, so an owner can get help with their first
   * listing; business-insight copy is for admins. Every request counts against the user's limits.
   */
  async suggest(dto: SuggestDto, userId: string) {
    if (!this.config.get<boolean>("ai.enabled")) {
      throw new ServiceUnavailableException("AI assist is disabled (set AI_ASSIST_ENABLED=true)");
    }

    if (dto.kind === "insights_copy") {
      const user = await this.users.findById(userId);
      if (user?.role !== "admin") {
        throw new ForbiddenException("Insights copy is available to admins only");
      }
    }

    this.limiter.consume(userId);

    const result = await this.llmService.generateDraft(dto.kind, dto.input);

    return {
      draft: result.draft,
      provider: result.provider,
      model: result.model,
      usedFallback: result.usedFallback,
    };
  }
}
