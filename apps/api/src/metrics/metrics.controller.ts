import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { PerformanceQueryDto } from './dto/performance-query.dto.js';
import { MetricsService } from './metrics.service.js';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** The centerpiece: per ad/adset/campaign unit economics for a date range + model. */
  @Get('performance')
  performance(@CurrentUser() user: AuthUser, @Query() q: PerformanceQueryDto) {
    return this.metrics.performance(user.tenantId, range(q), q.model ?? 'LAST_TOUCH');
  }

  /** Vintage ROAS by lead-created week. */
  @Get('cohorts')
  cohorts(@CurrentUser() user: AuthUser, @Query() q: PerformanceQueryDto) {
    return this.metrics.cohorts(user.tenantId, range(q));
  }

  /** Actionable recommendations (scale / pause / investigate). */
  @Get('recommendations')
  recommendations(@CurrentUser() user: AuthUser, @Query() q: PerformanceQueryDto) {
    return this.metrics.recommendations(user.tenantId, range(q), q.model ?? 'LAST_TOUCH');
  }

  /** Performance grouped by a creative dimension (hook/concept/angle/format/video). */
  @Get('creatives/insights')
  creatives(@CurrentUser() user: AuthUser, @Query() q: PerformanceQueryDto) {
    return this.metrics.creativeInsights(
      user.tenantId,
      range(q),
      q.dimension ?? 'hook',
      q.model ?? 'LAST_TOUCH',
    );
  }

  /** Full journey of a single lead (touchpoints → lead → qualified → won). */
  @Get('leads/:id/journey')
  journey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.metrics.journey(user.tenantId, id);
  }
}

function range(q: PerformanceQueryDto) {
  return { from: q.from ?? daysAgo(30), to: q.to ?? today() };
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
