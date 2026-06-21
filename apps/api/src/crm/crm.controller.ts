import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@adlink/core';
import { Roles } from '../common/rbac/roles.decorator.js';
import { CrmService } from './crm.service.js';
import { ConnectAmocrmDto } from './dto/connect-amocrm.dto.js';
import { ConnectBitrixDto } from './dto/connect-bitrix.dto.js';
import { SetMappingsDto } from './dto/set-mappings.dto.js';

@ApiTags('crm')
@ApiBearerAuth()
@Controller()
export class CrmController {
  constructor(private readonly svc: CrmService) {}

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('integrations/crm/bitrix24/connect')
  connect(@Body() dto: ConnectBitrixDto) {
    return this.svc.connectBitrix(dto);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('integrations/crm/amocrm/connect')
  connectAmo(@Body() dto: ConnectAmocrmDto) {
    return this.svc.connectAmocrm(dto);
  }

  @Get('crm')
  list() {
    return this.svc.list();
  }

  @Get('crm/:id/stages')
  stages(@Param('id') id: string) {
    return this.svc.stages(id);
  }

  @Get('crm/:id/stage-mappings')
  getMappings(@Param('id') id: string) {
    return this.svc.getMappings(id);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Put('crm/:id/stage-mappings')
  setMappings(@Param('id') id: string, @Body() dto: SetMappingsDto) {
    return this.svc.setMappings(id, dto);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('crm/:id/sync')
  sync(@Param('id') id: string) {
    return this.svc.triggerSync(id);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Delete('crm/:id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
