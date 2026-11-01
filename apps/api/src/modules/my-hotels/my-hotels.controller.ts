import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import multer from "multer";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { MongoIdPipe } from "../../common/pipes/mongo-id.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { imageFileFilter, MAX_IMAGE_BYTES } from "../../common/uploads/image-validation";
import { HotelFormDto } from "./dto/hotel-form.dto";
import { MyHotelsService } from "./my-hotels.service";

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: imageFileFilter,
};

@Controller("api/my-hotels")
@UseGuards(JwtAuthGuard)
export class MyHotelsController {
  constructor(private readonly myHotelsService: MyHotelsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor("imageFiles", 6, uploadOptions))
  async create(
    @Body() dto: HotelFormDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const hotel = await this.myHotelsService.create(dto, files, user.userId);
    res.setHeader("Location", `/api/my-hotels/${hotel._id}`);
    return hotel;
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.myHotelsService.findAll(user.userId);
  }

  @Get(":id")
  findOne(@Param("id", MongoIdPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.myHotelsService.findOne(id, user.userId);
  }

  @Patch(":id/active")
  @HttpCode(HttpStatus.OK)
  setActive(
    @Param("id", MongoIdPipe) id: string,
    @Body("isActive") isActive: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (typeof isActive !== "boolean") {
      throw new BadRequestException("isActive boolean required");
    }
    return this.myHotelsService.setActive(id, isActive, user.userId);
  }

  @Put(":hotelId")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor("imageFiles", 6, uploadOptions))
  update(
    @Param("hotelId", MongoIdPipe) hotelId: string,
    @Body() dto: HotelFormDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.myHotelsService.update(hotelId, dto, files, user.userId);
  }
}
