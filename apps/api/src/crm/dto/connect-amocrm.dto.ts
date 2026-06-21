import { IsString, MinLength } from 'class-validator';

export class ConnectAmocrmDto {
  @IsString()
  clientId!: string;

  /** Account base URL, e.g. https://acme.amocrm.ru */
  @IsString()
  baseUrl!: string;

  /** OAuth access token — encrypted into the vault. */
  @IsString()
  @MinLength(20)
  accessToken!: string;
}
