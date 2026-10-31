import { Transform, type TransformFnParams } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

// The form arrives as multipart text fields, so every value is a string (or an array of strings
// for bracketed keys such as `type[0]`). These transforms read the raw value because implicit
// conversion would already have turned "" into 0 for a number.
const raw = ({ obj, key }: TransformFnParams): unknown => obj[key];

const toTrimmed = (params: TransformFnParams) => {
  const value = raw(params);
  return typeof value === "string" ? value.trim() : value;
};

const toNumber = (params: TransformFnParams) => {
  const value = raw(params);
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" ? Number(value) : value;
};

const toList = (params: TransformFnParams) => {
  const value = raw(params);
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
};

/** Optional text that may be sent empty: validated only when something was actually entered. */
const IfEntered = () => ValidateIf((_, value) => value !== undefined && value !== "");

const URL_OPTIONS = { protocols: ["http", "https"], require_protocol: true };

/**
 * The fields an owner may set when creating or editing a hotel. Anything else in the request
 * (isFeatured, totalRevenue, averageRating, isActive, userId, ...) is stripped by the global
 * ValidationPipe and can never reach the database.
 */
export class HotelFormDto {
  @Transform(toTrimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @Transform(toTrimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

  @Transform(toTrimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  country: string;

  @Transform(toTrimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;

  @Transform(toList)
  @IsArray()
  @ArrayMinSize(1, { message: "select at least one hotel type" })
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  type: string[];

  @Transform(toList)
  @IsArray()
  @ArrayMinSize(1, { message: "select at least one facility" })
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  facilities: string[];

  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(100_000)
  pricePerNight: number;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(5)
  starRating: number;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(50)
  adultCount: number;

  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(50)
  childCount: number;

  /** Images the owner keeps when editing; new uploads arrive as files. */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayMaxSize(6)
  @IsUrl(URL_OPTIONS, { each: true })
  @MaxLength(2048, { each: true })
  imageUrls?: string[];

  @IfEntered()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(30)
  "contact.phone"?: string;

  @IfEntered()
  @Transform(toTrimmed)
  @IsEmail()
  @MaxLength(254)
  "contact.email"?: string;

  @IfEntered()
  @Transform(toTrimmed)
  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  "contact.website"?: string;

  @IfEntered()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(50)
  "policies.checkInTime"?: string;

  @IfEntered()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(50)
  "policies.checkOutTime"?: string;

  @IfEntered()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(1000)
  "policies.cancellationPolicy"?: string;

  @IfEntered()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(1000)
  "policies.petPolicy"?: string;

  @IfEntered()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(1000)
  "policies.smokingPolicy"?: string;
}
