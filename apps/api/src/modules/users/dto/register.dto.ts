import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsString({ message: "First Name is required" })
  firstName: string;

  @IsString({ message: "Last Name is required" })
  lastName: string;

  @IsEmail({}, { message: "Email is required" })
  email: string;

  @MinLength(6, { message: "Password with 6 or more characters required" })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
