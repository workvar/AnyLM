import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @MinLength(8, { message: "Password must be at least 8 characters" })
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
