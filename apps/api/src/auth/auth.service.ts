import { createHash, createHmac, randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Role, type User } from '@adlink/db';
import type { AuthUser } from '../common/auth/auth.types.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';
import type { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
  ) {}

  /** Register a brand-new agency: creates the Tenant and its OWNER user. */
  async register(input: RegisterDto) {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const tenant = await this.db.tenant.create({ data: { name: input.tenantName } });
    const user = await this.db.user.create({
      data: {
        tenantId: tenant.id,
        email: input.email,
        passwordHash,
        name: input.name ?? null,
        role: Role.OWNER,
      },
    });
    return this.issue(user);
  }

  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issue(user);
  }

  // ---- Google OAuth (authorization-code flow) ----

  buildGoogleAuthUrl(state: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL;
    if (!clientId || !redirectUri) throw new UnauthorizedException('Google login not configured');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async loginWithGoogle(code: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new UnauthorizedException('Google login not configured');
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) throw new UnauthorizedException('Google token exchange failed');

    const data = (await res.json()) as { id_token?: string };
    if (!data.id_token) throw new UnauthorizedException('No id_token from Google');

    // id_token comes directly from Google's token endpoint over TLS (server-to-server),
    // so decoding the payload without re-verifying the signature is safe here.
    const claims = decodeJwtPayload(data.id_token);
    if (!claims.email || claims.email_verified === false) {
      throw new UnauthorizedException('Google email not verified');
    }
    return this.issue(await this.findOrCreateUser(claims.email, claims.name, claims.picture));
  }

  // ---- Telegram Login Widget ----

  async loginWithTelegram(data: Record<string, string>) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new UnauthorizedException('Telegram login not configured');

    const { hash, ...fields } = data;
    if (!hash || !fields.id || !fields.auth_date) {
      throw new UnauthorizedException('Malformed Telegram payload');
    }

    // Verify per Telegram spec: HMAC-SHA256 of the data-check-string, keyed by SHA256(bot_token).
    const checkString = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${fields[k]}`)
      .join('\n');
    const secret = createHash('sha256').update(botToken).digest();
    const expected = createHmac('sha256', secret).update(checkString).digest('hex');
    if (expected !== hash) throw new UnauthorizedException('Invalid Telegram signature');

    // Reject stale logins (replay protection): widget data older than 24h.
    if (Math.floor(Date.now() / 1000) - Number(fields.auth_date) > 86_400) {
      throw new UnauthorizedException('Telegram login expired');
    }

    const name =
      [fields.first_name, fields.last_name].filter(Boolean).join(' ') ||
      fields.username ||
      `tg${fields.id}`;
    // Telegram never provides an email → deterministic synthetic address for find-or-create.
    const email = `tg${fields.id}@telegram.adlink`;
    return this.issue(await this.findOrCreateUser(email, name, fields.photo_url));
  }

  /** Find a user by email, or provision a brand-new tenant + OWNER for social sign-up. */
  private async findOrCreateUser(
    email: string,
    name?: string | null,
    avatarUrl?: string | null,
  ): Promise<User> {
    const existing = await this.db.user.findUnique({ where: { email } });
    if (existing) {
      // Keep the avatar fresh on each social login.
      if (avatarUrl && avatarUrl !== existing.avatarUrl) {
        return this.db.user.update({ where: { id: existing.id }, data: { avatarUrl } });
      }
      return existing;
    }
    const tenant = await this.db.tenant.create({
      data: { name: name ? `${name}'s workspace` : email },
    });
    return this.db.user.create({
      data: {
        tenantId: tenant.id,
        email,
        // unusable password — social users authenticate via the provider, not a password.
        passwordHash: await bcrypt.hash(randomUUID(), 10),
        name: name ?? null,
        avatarUrl: avatarUrl ?? null,
        role: Role.OWNER,
      },
    });
  }

  async me(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.sanitize(user);
  }

  private issue(user: User) {
    const payload: AuthUser = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      clientId: user.clientId,
    };
    return { token: this.jwt.sign(payload), user: this.sanitize(user) };
  }

  private sanitize(u: User) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      role: u.role,
      tenantId: u.tenantId,
      clientId: u.clientId,
    };
  }
}

/** Decode (not verify) a JWT payload — safe only for tokens received over a trusted channel. */
function decodeJwtPayload(jwt: string): {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
} {
  const payload = jwt.split('.')[1];
  if (!payload) throw new UnauthorizedException('Malformed id_token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}
