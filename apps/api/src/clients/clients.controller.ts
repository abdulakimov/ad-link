import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@adlink/core';
import { IsString, MinLength } from 'class-validator';
import { Roles } from '../common/rbac/roles.decorator.js';
import { ClientsService } from './clients.service.js';

class CreateClientDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

@ApiTags('clients')
@ApiBearerAuth()
@Controller()
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get('clients')
  list() {
    return this.clients.list();
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('clients')
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto.name);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Delete('clients/:id')
  remove(@Param('id') id: string) {
    return this.clients.remove(id);
  }
}
