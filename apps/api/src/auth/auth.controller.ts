import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { TelegramBotService } from './qr/telegram-bot.service.js';
import type { AuthUser } from '../common/auth/auth.types.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Public } from '../common/auth/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { QrLoginService } from './qr/qr-login.service.js';

const webOrigin = () => process.env.WEB_ORIGIN ?? 'http://localhost:3000';

// state cookies must be Secure in prod (HTTPS) but not in local http dev, where Secure
// would stop the browser from ever sending them back on the callback.
const stateCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 600_000,
  path: '/',
};

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
  private readonly log = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly qr: QrLoginService,
    private readonly bot: TelegramBotService,
  ) {}

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
    res.cookie('g_state', state, stateCookie);
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
      const issued = await this.auth.loginWithGoogle(code);

      // QR-login confirmation (state = `qr:<qrId>:<csrf>`): approve the desktop session,
      // then show the phone a success page instead of signing this device in.
      if (state.startsWith('qr:')) {
        const qrId = state.split(':')[1] ?? '';
        await this.qr.approve(qrId, issued);
        return res.redirect(`${web}/qr/${encodeURIComponent(qrId)}?done=1`);
      }
      res.redirect(`${web}/auth/callback?token=${encodeURIComponent(issued.token)}`);
    } catch (err) {
      this.log.warn(`Google callback failed: ${(err as Error).message}`);
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

  // Streams a Telegram user's profile photo, fetched server-side so the bot token is never
  // exposed to the browser. Public + cacheable; referenced by the user's avatarUrl.
  @SkipThrottle()
  @Public()
  @Get('auth/telegram/avatar/:userId')
  async telegramAvatar(@Param('userId') userId: string, @Res() res: Response) {
    const fileId = await this.auth.telegramPhotoFileId(userId);
    const file = fileId ? await this.bot.downloadFile(fileId) : null;
    if (!file) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(file.buffer);
  }

  // ---- QR login (scan with phone → approve in Telegram → auto-sign-in on desktop) ----

  @Public()
  @Post('auth/qr/start')
  qrStart() {
    return this.qr.start();
  }

  // polled every ~2s by the desktop until approval — exempt from the global rate limit
  @SkipThrottle()
  @Public()
  @Get('auth/qr/status')
  qrStatus(@Query('qrId') qrId: string, @Query('secret') secret: string) {
    return this.qr.status(qrId, secret);
  }

  // polled by the phone confirmation page — exempt from the global rate limit
  @SkipThrottle()
  @Public()
  @Get('auth/qr/info')
  qrInfo(@Query('qrId') qrId: string) {
    return this.qr.info(qrId);
  }

  // Phone taps "Confirm with Google" → start Google OAuth with the qrId carried in state.
  @Public()
  @Get('auth/qr/google')
  qrGoogleStart(@Query('qrId') qrId: string, @Res() res: Response) {
    const state = `qr:${qrId}:${randomUUID()}`;
    res.cookie('g_state', state, stateCookie);
    res.redirect(this.auth.buildGoogleAuthUrl(state));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }
}
