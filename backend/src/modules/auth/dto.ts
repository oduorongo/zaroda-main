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

  // 'public' | 'private' — private schools may onboard a non-teaching School Owner
  // account; defaults to 'public' if not sent (older clients, KNEC-registry schools).
  @IsOptional() @IsString() ownership?: string;
}

// Lightweight signup for a teacher whose school isn't a ZARODA tenant — no
// school name, county, or KNEC lookup. Used for Professional Records only.
export class SignupIndividualDto {
  @IsString()  firstName: string;
  @IsString()  lastName:  string;
  @IsEmail()   email:     string;
  @IsString()  @MinLength(8) password: string;

  @IsOptional() @IsString() phone?: string;
  // Referring teacher's user id, from their Professional Records referral link.
  @IsOptional() @IsString() ref?: string;
}

export class LoginDto {
  @IsEmail()  email:    string;
  @IsString() password: string;
}
