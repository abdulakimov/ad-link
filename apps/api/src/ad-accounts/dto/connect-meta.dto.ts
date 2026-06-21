import { IsOptional, IsString, MinLength } from 'class-validator';

export class ConnectMetaDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  /** act_<id> */
  @IsString()
  externalId!: string;

  @IsString()
  name!: string;

  @IsString()
  currency!: string;

  @IsString()
  timezone!: string;

  /** Long-lived system-user token — encrypted into the vault, never stored in plaintext. */
  @IsString()
  @MinLength(10)
  token!: string;
}
