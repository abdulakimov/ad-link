import { IsString, MinLength } from 'class-validator';

export class ConnectBitrixDto {
  @IsString()
  clientId!: string;

  /** Display portal, e.g. https://acme.bitrix24.ru */
  @IsString()
  portal!: string;

  /** Full inbound-webhook base URL — encrypted into the vault. */
  @IsString()
  @MinLength(20)
  webhookUrl!: string;
}
