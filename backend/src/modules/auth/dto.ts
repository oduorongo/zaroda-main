import { IsEmail, IsString, MinLength, IsOptional, IsArray } from 'class-validator';

export class SignupDto {
  @IsString()  schoolName:      string;
  @IsString()  adminFirstName:  string;
  @IsString()  adminLastName:   string;
  @IsEmail()   email:           string;
  @IsString()  @MinLength(8) password: string;

  @IsOptional() @IsString() phone?:       string;
  @IsOptional() @IsString() knecCode?:    string;
  @IsOptional() @IsString() countyId?:    string;
  @IsOptional() @IsString() subCountyId?: string;
  @IsOptional() @IsString() zoneId?:      string;
  @IsOptional() @IsString() county?:      string;
  @IsOptional() @IsString() subCounty?:   string;
  @IsOptional() @IsString() zone?:        string;

  // Which bands the school runs — 'primary_js' and/or 'senior'.
  @IsOptional() @IsArray() schoolLevels?: string[];
}

export class LoginDto {
  @IsEmail()  email:    string;
  @IsString() password: string;
}
