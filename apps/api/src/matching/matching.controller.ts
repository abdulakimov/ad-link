import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@adlink/core';
import type { AuthUser } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Public } from '../common/auth/public.decorator.js';
import { Roles } from '../common/rbac/roles.decorator.js';
import { CaptureService } from './capture.service.js';
import { CaptureDto } from './dto/capture.dto.js';
import { ResolveMatchDto } from './dto/resolve-match.dto.js';
import { MatchingService } from './matching.service.js';

@ApiTags('matching')
@Controller()
export class MatchingController {
  constructor(
    private readonly matching: MatchingService,
    private readonly capture: CaptureService,
  ) {}

  @ApiBearerAuth()
  @Get('data-trust')
  trust(@CurrentUser() user: AuthUser) {
    return this.matching.matchRate(user.tenantId);
  }

  @ApiBearerAuth()
  @Get('review-queue')
  queue(@CurrentUser() user: AuthUser) {
    return this.matching.reviewQueue(user.tenantId);
  }

  @ApiBearerAuth()
  @Get('ads')
  ads(@CurrentUser() user: AuthUser) {
    return this.matching.listAds(user.tenantId);
  }

  @ApiBearerAuth()
  @Post('review-queue/:leadId/resolve')
  resolve(
    @Param('leadId') leadId: string,
    @Body() dto: ResolveMatchDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.matching.resolveManual(user.tenantId, leadId, dto.adId, user.sub);
  }

  @ApiBearerAuth()
  @Roles(Role.OWNER, Role.ADMIN)
  @Post('matching/run')
  run(@CurrentUser() user: AuthUser) {
    return this.matching.matchUnmatched(user.tenantId);
  }

  /** Public landing beacon (no auth). */
  @Public()
  @Post('capture')
  record(@Body() dto: CaptureDto) {
    return this.capture.record(dto);
  }
}
