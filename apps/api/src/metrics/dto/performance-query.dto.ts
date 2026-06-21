import { IsIn, IsOptional, Matches } from 'class-validator';
import type { CreativeDimension, TouchModel } from '../metrics.service.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PerformanceQueryDto {
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsIn(['FIRST_TOUCH', 'LAST_TOUCH'])
  model?: TouchModel;

  @IsOptional()
  @IsIn(['hook', 'concept', 'angle', 'format', 'video'])
  dimension?: CreativeDimension;
}
