import { IsOptional, IsString } from 'class-validator';

export class CaptureDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  adExternalId?: string;

  @IsOptional()
  @IsString()
  utmContent?: string;

  @IsOptional()
  @IsString()
  fbclid?: string;
}
