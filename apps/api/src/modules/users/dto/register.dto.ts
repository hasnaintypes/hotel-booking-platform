import { IsEmail, IsOptional, IsString, MaxLength, MinLength, Validate } from "class-validator";
import {
  NotCommonPasswordConstraint,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../password-policy";

export class RegisterDto {
  @IsString({ message: "First Name is required" })
  firstName: string;

  @IsString({ message: "Last Name is required" })
  lastName: string;

  @IsEmail({}, { message: "Email is required" })
  email: string;

  // Applies to new accounts only. Login deliberately keeps its old, looser rule so that people who
  // registered under the previous six-character policy can still sign in.
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  })
  @Validate(NotCommonPasswordConstraint)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
