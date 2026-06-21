import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AdAccount } from '@adlink/db';
import { Queue } from 'bullmq';
import { ensureDefaultClient } from '../clients/default-client.js';
import { SecretsVault } from '../common/crypto/secrets-vault.service.js';
import { requireTenantId } from '../common/tenant/tenant-context.js';
import { META_SYNC_QUEUE } from '../connectors/meta/meta.processor.js';
import type { Db } from '../prisma/prisma.client.js';
import { DB } from '../prisma/prisma.tokens.js';
import type { ConnectMetaDto } from './dto/connect-meta.dto.js';

interface MetaRawAccount {
  account_id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
}

interface MetaSession {
  token: string;
  tenantId: string;
  accounts: MetaRawAccount[];
  expires: number;
}

/** Queries below run inside the request's tenant context → auto-scoped. */
@Injectable()
export class AdAccountsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly vault: SecretsVault,
    @InjectQueue(META_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  async connectMeta(dto: ConnectMetaDto) {
    const clientId = dto.clientId ?? (await ensureDefaultClient(this.db));

    const created = await this.db.adAccount.create({
      data: {
        tenantId: requireTenantId(),
        clientId,
        provider: 'META',
        externalId: dto.externalId,
        name: dto.name,
        currency: dto.currency,
        timezone: dto.timezone,
        tokenRef: this.vault.store(dto.token), // encrypted at rest
      },
    });
    return this.safe(created);
  }

  async list() {
    const accounts = await this.db.adAccount.findMany({ orderBy: { createdAt: 'desc' } });
    return accounts.map((a) => this.safe(a));
  }

  // ---- Meta OAuth (Facebook Login) ----

  buildMetaOAuthUrl(state: string): string {
    const appId = process.env.META_APP_ID;
    const redirect = process.env.META_REDIRECT_URI;
    if (!appId || !redirect) throw new ServiceUnavailableException('Meta OAuth not configured');
    const v = process.env.META_API_VERSION ?? 'v21.0';
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirect,
      state,
      response_type: 'code',
      scope: 'ads_read,ads_management,leads_retrieval,business_management',
    });
    return `https://www.facebook.com/${v}/dialog/oauth?${params.toString()}`;
  }

  /** Exchange the OAuth code for a long-lived user access token. */
  async exchangeMetaCode(code: string): Promise<string> {
    const appId = process.env.META_APP_ID;
    const secret = process.env.META_APP_SECRET;
    const redirect = process.env.META_REDIRECT_URI;
    if (!appId || !secret || !redirect) throw new ServiceUnavailableException('Meta OAuth not configured');
    const v = process.env.META_API_VERSION ?? 'v21.0';

    const tokRes = await fetch(
      `https://graph.facebook.com/${v}/oauth/access_token?${new URLSearchParams({
        client_id: appId,
        client_secret: secret,
        redirect_uri: redirect,
        code,
      })}`,
    );
    if (!tokRes.ok) throw new UnauthorizedException('Meta token exchange failed');
    const short = ((await tokRes.json()) as { access_token?: string }).access_token;
    if (!short) throw new UnauthorizedException('No access token from Meta');

    // Swap the short-lived token for a long-lived one (~60 days).
    const llRes = await fetch(
      `https://graph.facebook.com/${v}/oauth/access_token?${new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: secret,
        fb_exchange_token: short,
      })}`,
    );
    const long = llRes.ok ? ((await llRes.json()) as { access_token?: string }).access_token : short;
    return long ?? short;
  }

  /** Fetch the ad accounts a token can read (no DB writes) — drives the import picker. */
  async listMetaAccounts(token: string): Promise<MetaRawAccount[]> {
    const v = process.env.META_API_VERSION ?? 'v21.0';
    const res = await fetch(
      `https://graph.facebook.com/${v}/me/adaccounts?${new URLSearchParams({
        fields: 'account_id,name,currency,timezone_name',
        access_token: token,
        limit: '200',
      })}`,
    );
    if (!res.ok) throw new UnauthorizedException('Failed to fetch Meta ad accounts');
    return ((await res.json()) as { data?: MetaRawAccount[] }).data ?? [];
  }

  /** Import only the accounts the user picked. Must run inside a tenant context. */
  async importMetaAccounts(token: string, accounts: MetaRawAccount[]): Promise<number> {
    const clientId = await ensureDefaultClient(this.db);
    const tenantId = requireTenantId();
    const tokenRef = this.vault.store(token);

    for (const a of accounts) {
      const externalId = `act_${a.account_id}`;
      await this.db.$base.adAccount.upsert({
        where: { provider_externalId: { provider: 'META', externalId } },
        create: {
          tenantId,
          clientId,
          provider: 'META',
          externalId,
          name: a.name ?? null,
          currency: a.currency ?? 'USD',
          timezone: a.timezone_name ?? 'UTC',
          tokenRef,
        },
        update: {
          name: a.name ?? null,
          currency: a.currency ?? 'USD',
          timezone: a.timezone_name ?? 'UTC',
          tokenRef,
          syncState: 'OK',
        },
      });
    }
    return accounts.length;
  }

  // ---- Short-lived picker sessions (in-memory) ----
  // ponytail: in-process Map with TTL; move to Redis if the API runs multi-instance.
  private readonly metaSessions = new Map<string, MetaSession>();

  createMetaSession(data: Omit<MetaSession, 'expires'>): string {
    const id = randomUUID();
    this.pruneMetaSessions();
    this.metaSessions.set(id, { ...data, expires: Date.now() + 10 * 60_000 });
    return id;
  }

  getMetaSession(id: string): MetaSession | undefined {
    const s = this.metaSessions.get(id);
    if (!s) return undefined;
    if (s.expires < Date.now()) {
      this.metaSessions.delete(id);
      return undefined;
    }
    return s;
  }

  deleteMetaSession(id: string) {
    this.metaSessions.delete(id);
  }

  private pruneMetaSessions() {
    const now = Date.now();
    for (const [id, s] of this.metaSessions) if (s.expires < now) this.metaSessions.delete(id);
  }

  /** Opt this ad account in/out of the Meta feedback loop (PLAN §6.3). */
  async setFeedback(id: string, optIn: boolean) {
    const acc = await this.db.adAccount.findFirst({ where: { id } });
    if (!acc) throw new NotFoundException('Ad account not found');
    return this.safe(
      await this.db.$base.adAccount.update({ where: { id }, data: { feedbackOptIn: optIn } }),
    );
  }

  async triggerSync(id: string) {
    const acc = await this.db.adAccount.findFirst({ where: { id } });
    if (!acc) throw new NotFoundException('Ad account not found');
    await this.queue.add('sync', { adAccountId: acc.id }, { removeOnComplete: true, removeOnFail: 100 });
    return { enqueued: true, adAccountId: acc.id };
  }

  async remove(id: string) {
    const acc = await this.db.adAccount.findFirst({ where: { id } }); // tenant-scoped
    if (!acc) throw new NotFoundException('Ad account not found');
    await this.db.$base.adAccount.delete({ where: { id } });
    return { ok: true };
  }

  /** Never expose the token ref to the frontend. */
  private safe(a: AdAccount) {
    return {
      id: a.id,
      clientId: a.clientId,
      provider: a.provider,
      externalId: a.externalId,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone,
      feedbackOptIn: a.feedbackOptIn,
      lastSyncAt: a.lastSyncAt,
      syncState: a.syncState,
    };
  }
}
