import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { imageFileFilter, MAX_IMAGE_BYTES } from "../../common/uploads/image-validation";
import { HotelFormDto } from "./dto/hotel-form.dto";
import { MyHotelsService } from "./my-hotels.service";

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: imageFileFilter,
};

@Controller("hotels")
@UseGuards(JwtAuthGuard)
export class MyHotelsController {
  constructor(private readonly myHotelsService: MyHotelsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: HotelFormDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const hotel = await this.myHotelsService.create(dto, user.userId);
    res.setHeader("Location", `/api/v1/manage/hotels/${hotel._id}`);
    return hotel;
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.myHotelsService.findAll(user.userId);
  }

  @Get(":id")
  findOne(@Param("id", UuidPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.myHotelsService.findOne(id, user.userId);
  }

  @Get(":id/stats")
  stats(@Param("id", UuidPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.myHotelsService.stats(id, user.userId);
  }

  @Patch(":id/active")
  @HttpCode(HttpStatus.OK)
  setActive(
    @Param("id", UuidPipe) id: string,
    @Body("isActive") isActive: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (typeof isActive !== "boolean") {
      throw new BadRequestException("isActive boolean required");
    }
    return this.myHotelsService.setActive(id, isActive, user.userId);
  }

  @Patch(":hotelId")
  @HttpCode(HttpStatus.OK)
  update(
    @Param("hotelId", UuidPipe) hotelId: string,
    @Body() dto: HotelFormDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.myHotelsService.update(hotelId, dto, user.userId);
  }

  @Post(":id/images")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor("imageFiles", 6, uploadOptions))
  addImages(
    @Param("id", UuidPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.myHotelsService.addImages(id, files, user.userId);
  }

  @Delete(":id/images")
  @HttpCode(HttpStatus.OK)
  removeImage(
    @Param("id", UuidPipe) id: string,
    @Body("url") url: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (typeof url !== "string" || url.length === 0) {
      throw new BadRequestException("url required");
    }
    return this.myHotelsService.removeImage(id, url, user.userId);
  }
}
