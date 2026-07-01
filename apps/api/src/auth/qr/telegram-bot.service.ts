import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AuthService } from '../auth.service.js';
import { QrLoginService } from './qr-login.service.js';

const TELEGRAM_API = 'https://api.telegram.org';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}
interface TgUpdate {
  update_id: number;
  message?: { chat: { id: number }; from?: TgUser; text?: string };
}

/**
 * Drives the QR-login confirmation: long-polls Telegram's getUpdates so that when a user taps
 * Start on the bot deep-link, we approve the matching desktop session. Long-polling (vs webhook)
 * means it works in local dev with no public HTTPS URL. Disabled if no bot token is configured.
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramBotService.name);
  private readonly token = process.env.TELEGRAM_BOT_TOKEN;
  private offset = 0;
  private running = false;
  private poll?: AbortController;

  constructor(
    private readonly qr: QrLoginService,
    private readonly auth: AuthService,
  ) {}

  async onModuleInit() {
    if (!this.token) {
      this.log.warn('TELEGRAM_BOT_TOKEN not set — QR login bot disabled');
      return;
    }
    if (process.env.TELEGRAM_BOT_POLLING === 'off') {
      this.log.log('QR login bot polling disabled via TELEGRAM_BOT_POLLING=off');
      return;
    }
    try {
      const me = await this.call<{ username?: string }>('getMe');
      // drop any webhook so getUpdates is allowed; also clears a backlog of stale updates
      await this.call('deleteWebhook', { drop_pending_updates: true });
      this.log.log(`QR login bot @${me?.username} online (long-polling)`);
    } catch (e) {
      this.log.error(`Telegram bot init failed: ${(e as Error).message} — QR login degraded`);
      return;
    }
    this.running = true;
    void this.loop();
  }

  onModuleDestroy() {
    this.running = false;
    this.poll?.abort();
  }

  private async loop() {
    while (this.running) {
      try {
        this.poll = new AbortController();
        const updates = await this.call<TgUpdate[]>(
          'getUpdates',
          { offset: this.offset, timeout: 25, allowed_updates: ['message'] },
          this.poll.signal,
        );
        for (const u of updates ?? []) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e) =>
            this.log.error(`QR update ${u.update_id}: ${(e as Error).message}`),
          );
        }
      } catch (e) {
        if (!this.running) break;
        // transient network/409 (another getUpdates) — back off briefly and retry
        this.log.debug?.(`getUpdates retry: ${(e as Error).message}`);
        await sleep(1500);
      }
    }
  }

  private async handle(u: TgUpdate) {
    const msg = u.message;
    const text = msg?.text;
    if (!msg || !text || !msg.from) return;

    const m = /^\/start(?:\s+(\S+))?/.exec(text);
    if (!m) return;
    const payload = m[1];
    const from = msg.from;

    this.log.log(`/start from ${from.id} (@${from.username ?? '-'}) payload=${payload ?? '<none>'}`);

    if (!payload) {
      await this.reply(msg.chat.id, 'AdLink: kompyuterda QR kodni skanerlab tizimga kiring.');
      return;
    }

    // pull the profile photo so the web app can show it (best-effort — privacy/no-photo → null)
    const photoFileId = await this.profilePhotoFileId(from.id).catch(() => null);

    // trusted channel (bot getUpdates) → issue the JWT directly, then attach to the session
    const issued = await this.auth.loginTelegramProfile({
      id: from.id,
      first_name: from.first_name,
      last_name: from.last_name,
      username: from.username,
      photoFileId,
    });
    const result = await this.qr.approve(payload, issued);
    this.log.log(`approve qr=${payload} → ok=${result.ok}${result.reason ? ` (${result.reason})` : ''}`);
    await this.reply(
      msg.chat.id,
      result.ok
        ? '✅ Tizimga muvaffaqiyatli kirdingiz. Kompyuteringizga qayting.'
        : '⚠️ QR kod muddati tugagan. Kompyuterda yangi kod oching.',
    );
  }

  private reply(chatId: number, text: string) {
    return this.call('sendMessage', { chat_id: chatId, text }).catch(() => undefined);
  }

  /** Largest-resolution profile-photo file_id for a user, or null if none/private. */
  private async profilePhotoFileId(userId: number): Promise<string | null> {
    const res = await this.call<{ photos?: { file_id: string }[][] }>('getUserProfilePhotos', {
      user_id: userId,
      limit: 1,
    });
    const sizes = res?.photos?.[0];
    // Telegram returns ascending sizes — the last entry is the highest resolution.
    const largest = sizes?.[sizes.length - 1];
    return largest?.file_id ?? null;
  }

  /**
   * Download a Telegram file by id (getFile → file path → bytes). Called by the avatar proxy so
   * the bot token stays server-side. Returns null if the token is unset or the file is gone.
   */
  async downloadFile(fileId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.token) return null;
    try {
      const file = await this.call<{ file_path?: string }>('getFile', { file_id: fileId });
      if (!file?.file_path) return null;
      const res = await fetch(`${TELEGRAM_API}/file/bot${this.token}/${file.file_path}`);
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, contentType: res.headers.get('content-type') ?? 'image/jpeg' };
    } catch {
      return null;
    }
  }

  private async call<T>(
    method: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    // long-poll getUpdates relies on the shutdown signal; other calls get a 30s safety timeout
    const ctrl = signal ? undefined : new AbortController();
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 30_000) : undefined;
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: signal ?? ctrl?.signal,
      });
      const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
      if (!data.ok) throw new Error(data.description ?? `Telegram ${method} failed`);
      return data.result as T;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
