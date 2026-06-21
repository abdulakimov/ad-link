import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@adlink/core';
import { Roles } from '../common/rbac/roles.decorator.js';
import { AdAccountsService } from './ad-accounts.service.js';
import { ConnectMetaDto } from './dto/connect-meta.dto.js';
import { FeedbackDto } from './dto/feedback.dto.js';

@ApiTags('ad-accounts')
@ApiBearerAuth()
@Controller()
export class AdAccountsController {
  constructor(private readonly svc: AdAccountsService) {}

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('integrations/meta/connect')
  connect(@Body() dto: ConnectMetaDto) {
    return this.svc.connectMeta(dto);
  }

  @Get('ad-accounts')
  list() {
    return this.svc.list();
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('ad-accounts/:id/sync')
  sync(@Param('id') id: string) {
    return this.svc.triggerSync(id);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Put('ad-accounts/:id/feedback')
  feedback(@Param('id') id: string, @Body() dto: FeedbackDto) {
    return this.svc.setFeedback(id, dto.optIn);
  }
}
