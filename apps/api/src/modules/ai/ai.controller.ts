import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AiService } from "./ai.service";
import { SuggestDto } from "./dto/suggest.dto";

@Controller("api/ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("suggest")
  @HttpCode(HttpStatus.OK)
  suggest(@Body() dto: SuggestDto) {
    return this.aiService.suggest(dto);
  }
}
