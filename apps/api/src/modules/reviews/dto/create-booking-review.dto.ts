import { Type } from "class-transformer";
import {
  IsDefined,
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ReviewCategoriesDto } from "./review-categories.dto";

export class CreateBookingReviewDto {
  @IsUUID()
  hotelId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @MinLength(3)
  comment: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ReviewCategoriesDto)
  categories: ReviewCategoriesDto;
}
