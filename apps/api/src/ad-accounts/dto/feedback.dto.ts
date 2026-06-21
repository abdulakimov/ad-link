import { IsBoolean } from 'class-validator';

export class FeedbackDto {
  @IsBoolean()
  optIn!: boolean;
}
