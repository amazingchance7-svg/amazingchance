import {
    IsEmail,
    IsString,
    Matches,
    MaxLength,
    MinLength,
  } from 'class-validator';
  
  export class RegisterDto {
    @IsEmail()
    email!: string;
  
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(/[a-z]/, {
      message: 'Password must contain a lowercase letter',
    })
    @Matches(/[A-Z]/, {
      message: 'Password must contain an uppercase letter',
    })
    @Matches(/[0-9]/, {
      message: 'Password must contain a number',
    })
    password!: string;
  }