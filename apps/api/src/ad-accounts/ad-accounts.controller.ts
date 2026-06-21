import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@adlink/core';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import type { Request, Response } from 'express';
import type { AuthUser } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Public } from '../common/auth/public.decorator.js';
import { Roles } from '../common/rbac/roles.decorator.js';
import { AdAccountsService } from './ad-accounts.service.js';
import { ConnectMetaDto } from './dto/connect-meta.dto.js';
import { FeedbackDto } from './dto/feedback.dto.js';

class ImportMetaDto {
  @IsString()
  sessionId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  externalIds!: string[];
}

const webOrigin = () => process.env.WEB_ORIGIN ?? 'http://localhost:3000';

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

@ApiTags('ad-accounts')
@ApiBearerAuth()
@Controller()
export class AdAccountsController {
  constructor(
    private readonly svc: AdAccountsService,
    private readonly jwt: JwtService,
  ) {}

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('integrations/meta/connect')
  connect(@Body() dto: ConnectMetaDto) {
    return this.svc.connectMeta(dto);
  }

  // ---- Meta OAuth (Facebook Login) — browser redirects here with the user's JWT in the query ----

  @Public()
  @Get('integrations/meta/oauth/start')
  async metaStart(@Query('token') userToken: string, @Res() res: Response) {
    const web = webOrigin();
    try {
      const payload = await this.jwt.verifyAsync(userToken);
      const state = await this.jwt.signAsync(
        { sub: payload.sub, tenantId: payload.tenantId, role: payload.role },
        { expiresIn: '10m' },
      );
      res.cookie('m_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600_000, path: '/' });
      res.redirect(this.svc.buildMetaOAuthUrl(state));
    } catch {
      res.redirect(`${web}/connections?error=meta`);
    }
  }

  @Public()
  @Get('integrations/meta/oauth/callback')
  async metaCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const web = webOrigin();
    try {
      const cookieState = parseCookies(req.headers.cookie)['m_state'];
      if (!code || !state || state !== cookieState) throw new Error('state mismatch');
      const payload = await this.jwt.verifyAsync(state);
      res.clearCookie('m_state', { path: '/' });

      // Don't import yet — fetch the candidates and let the user pick on the web.
      const token = await this.svc.exchangeMetaCode(code);
      const accounts = await this.svc.listMetaAccounts(token);
      const sessionId = this.svc.createMetaSession({ token, tenantId: payload.tenantId, accounts });
      res.redirect(`${web}/connections?meta_session=${sessionId}`);
    } catch {
      res.redirect(`${web}/connections?error=meta`);
    }
  }

  /** Candidate accounts for the picker — scoped to the session's tenant. */
  @Roles(Role.OWNER, Role.ADMIN)
  @Get('integrations/meta/oauth/session/:id')
  metaSession(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const s = this.svc.getMetaSession(id);
    if (!s || s.tenantId !== user.tenantId) return { accounts: [] };
    return {
      accounts: s.accounts.map((a) => ({
        externalId: `act_${a.account_id}`,
        name: a.name ?? null,
        currency: a.currency ?? 'USD',
      })),
    };
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Post('integrations/meta/import')
  async metaImport(@Body() dto: ImportMetaDto, @CurrentUser() user: AuthUser) {
    const s = this.svc.getMetaSession(dto.sessionId);
    if (!s || s.tenantId !== user.tenantId) return { imported: 0 };
    const chosen = s.accounts.filter((a) => dto.externalIds.includes(`act_${a.account_id}`));
    const imported = await this.svc.importMetaAccounts(s.token, chosen);
    this.svc.deleteMetaSession(dto.sessionId);
    return { imported };
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
  @Delete('ad-accounts/:id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Put('ad-accounts/:id/feedback')
  feedback(@Param('id') id: string, @Body() dto: FeedbackDto) {
    return this.svc.setFeedback(id, dto.optIn);
  }
}
