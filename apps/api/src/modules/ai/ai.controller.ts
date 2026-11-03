import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { AiService } from "./ai.service";
import { SuggestDto } from "./dto/suggest.dto";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("suggestions")
  @HttpCode(HttpStatus.OK)
  suggest(@Body() dto: SuggestDto, @CurrentUser() user: AuthenticatedUser) {
    return this.aiService.suggest(dto, user.userId);
  }
}
