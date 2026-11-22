import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { AiService } from "./ai.service";
import { SuggestResponseDto } from "./dto/ai-response.dto";
import { SuggestDto } from "./dto/suggest.dto";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("suggestions")
  @HttpCode(HttpStatus.OK)
  @ZodResponse({
    type: SuggestResponseDto,
    status: 200,
    description: "The generated draft and the provider that answered",
  })
  suggest(@Body() dto: SuggestDto, @CurrentUser() user: AuthenticatedUser) {
    return this.aiService.suggest(dto, user.userId);
  }
}
