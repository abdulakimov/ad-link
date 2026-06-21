import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@adlink/core';
import type { AuthUser } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Roles } from '../common/rbac/roles.decorator.js';
import { ConversionsService } from './conversions.service.js';

@ApiTags('conversions')
@ApiBearerAuth()
@Controller()
export class ConversionsController {
  constructor(private readonly conversions: ConversionsService) {}

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('conversions/generate')
  generate(@CurrentUser() user: AuthUser) {
    return this.conversions.generate(user.tenantId);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('conversions/push')
  push(@CurrentUser() user: AuthUser) {
    return this.conversions.push(user.tenantId);
  }

  @Get('conversions')
  list(@CurrentUser() user: AuthUser) {
    return this.conversions.list(user.tenantId);
  }
}
