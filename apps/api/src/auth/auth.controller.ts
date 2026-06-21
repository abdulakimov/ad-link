import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Public } from '../common/auth/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

const webOrigin = () => process.env.WEB_ORIGIN ?? 'http://localhost:3000';

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  // ---- Google OAuth ----

  @Public()
  @Get('auth/google')
  googleStart(@Res() res: Response) {
    const state = randomUUID();
    // httpOnly state cookie defends the callback against login-CSRF.
    res.cookie('g_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 600_000,
      path: '/',
    });
    res.redirect(this.auth.buildGoogleAuthUrl(state));
  }

  @Public()
  @Get('auth/google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const web = webOrigin();
    try {
      const cookieState = parseCookies(req.headers.cookie)['g_state'];
      if (!code || !state || !cookieState || state !== cookieState) {
        throw new Error('state mismatch');
      }
      res.clearCookie('g_state', { path: '/' });
      const { token } = await this.auth.loginWithGoogle(code);
      res.redirect(`${web}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch {
      res.redirect(`${web}/login?error=google`);
    }
  }

  // ---- Telegram Login Widget (redirects here with signed user fields) ----

  @Public()
  @Get('auth/telegram/callback')
  async telegramCallback(@Query() query: Record<string, string>, @Res() res: Response) {
    const web = webOrigin();
    try {
      const { token } = await this.auth.loginWithTelegram(query);
      res.redirect(`${web}/auth/callback?token=${encodeURIComponent(token)}`);
    } catch {
      res.redirect(`${web}/login?error=telegram`);
    }
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }
}
