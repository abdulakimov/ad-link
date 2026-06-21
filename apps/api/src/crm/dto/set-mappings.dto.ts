import { Type } from 'class-transformer';
import { ArrayMinSize, IsIn, IsString, ValidateNested } from 'class-validator';
import { CanonicalStatus } from '@adlink/core';

export class StageMappingItemDto {
  @IsString()
  externalStageId!: string;

  @IsString()
  externalStageName!: string;

  @IsIn(Object.values(CanonicalStatus))
  canonical!: CanonicalStatus;
}

export class SetMappingsDto {
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => StageMappingItemDto)
  mappings!: StageMappingItemDto[];
}
