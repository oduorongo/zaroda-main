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
  // Not always an email — parents without one log in by phone number instead, so this
  // isn't validated as @IsEmail(). AuthService decides which lookup to use.
  @IsString() email:    string;
  @IsString() password: string;
}

// Converting an existing individual (Professional Records) account into a real
// school account. Identity fields — email, password, name — come from the
// authenticated user, so this carries only the school details that signup asks
// for and an individual signup never collected.
export class UpgradeToSchoolDto {
  @IsString()  schoolName: string;

  @IsOptional() @IsString() phone?:       string;
  @IsOptional() @IsString() knecCode?:    string;
  @IsOptional() @IsString() countyId?:    string;
  @IsOptional() @IsString() subCountyId?: string;
  @IsOptional() @IsString() zoneId?:      string;
  @IsOptional() @IsString() county?:      string;
  @IsOptional() @IsString() subCounty?:   string;
  @IsOptional() @IsString() zone?:        string;

  @IsOptional() @IsArray()  schoolLevels?: string[];
  @IsOptional() @IsString() ownership?:    string;
}
