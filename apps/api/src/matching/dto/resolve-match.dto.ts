import { IsString } from 'class-validator';

export class ResolveMatchDto {
  @IsString()
  adId!: string;
}
