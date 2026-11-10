import type { Pool } from 'pg';
import type { TelegramInlineKeyboardMarkup } from './CommunityReplyRunner';

export const DEFAULT_FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1134282109069209';
export const DEFAULT_COMMUNITY_NAME = 'Cộng đồng Du lịch & Sống tại Việt Nam';

const BOT_COMMANDS = [
  { command: 'start', description: 'Bắt đầu trò chuyện & nhận tư vấn du lịch' },
  { command: 'community', description: 'Nhận link tham gia Cộng đồng Facebook TripC' },
  { command: 'help', description: 'Xem hướng dẫn & chủ đề bot có thể hỗ trợ' },
];

export type TelegramCommand = 'start' | 'community' | 'help' | 'unknown';

type TelegramChat = { id?: number; type?: string };
type TelegramUser = { id?: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
type TelegramMessage = {
  message_id?: number;
  text?: string;
  business_connection_id?: string;
  from?: TelegramUser;
  chat?: TelegramChat;
};
export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  business_message?: TelegramMessage;
};

export function parseTelegramCommand(text?: string | null): TelegramCommand | null {
  const trimmed = text?.trim();
  if (!trimmed || !trimmed.startsWith('/')) return null;
  const cmd = trimmed.slice(1).split(/\s+/)[0]?.split('@')[0]?.toLowerCase() ?? '';
  if (!cmd) return 'unknown';
  if (cmd === 'start') return 'start';
  if (cmd === 'community' || cmd === 'congdong' || cmd === 'nhom' || cmd === 'group') return 'community';
  if (cmd === 'help' || cmd === 'menu' || cmd === 'trogiup' || cmd === 'tuvan') return 'help';
  return 'unknown';
}

export function normalizeGroupUrl(raw?: string | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_FACEBOOK_GROUP_URL;
  return /^https?:\/\//i.test(trimmed) ? trimmed : DEFAULT_FACEBOOK_GROUP_URL;
}

export function buildCommandReply(
  command: 'start' | 'community' | 'help',
  options: {
    userName?: string | null;
    communityName?: string | null;
    groupUrl?: string | null;
    positioning?: string | null;
  } = {},
): {
  text: string;
  reply_markup?: TelegramInlineKeyboardMarkup;
  includeInviteLog: boolean;
  inviteGroupUrl: string;
} {
  const groupUrl = normalizeGroupUrl(options.groupUrl);
  const communityName = options.communityName?.trim() || DEFAULT_COMMUNITY_NAME;
  const rawName = options.userName?.trim();
  const greetingName = rawName && rawName !== 'Telegram user' ? ` ${rawName}` : '';
  const positioningLine = options.positioning?.trim() ? `\n✨ ${options.positioning.trim()}` : '';
  const reply_markup: TelegramInlineKeyboardMarkup | undefined = /^https?:\/\//i.test(groupUrl)
    ? { inline_keyboard: [[{ text: '👥 Tham gia Cộng đồng trên Facebook', url: groupUrl }]] }
    : undefined;

  if (command === 'community') {
    return {
      text:
        `Chào${greetingName}! Mời bạn tham gia ${communityName} trên Facebook để cùng người dân địa phương và cộng đồng tại Việt Nam chia sẻ kinh nghiệm thực tế, gợi ý địa điểm và hỏi đáp nhanh mỗi ngày nhé:\n👉 ${groupUrl}\n\nBạn cũng có thể nhắn trực tiếp cho mình ngay tại đây bất cứ lúc nào!`,
      reply_markup,
      includeInviteLog: true,
      inviteGroupUrl: groupUrl,
    };
  }

  if (command === 'help') {
    return {
      text:
        `Bạn có thể trò chuyện với mình giống như một người bạn bản địa vậy:\n• Hỏi về khu vực lưu trú, bãi biển, ẩm thực, cuộc sống tại Đà Nẵng / Việt Nam\n• Hỏi về kinh nghiệm du lịch, đi lại, thủ tục cơ bản\n• Nhắn /community để nhận link vào ${communityName} trên Facebook (${groupUrl})\n\nBạn đang quan tâm đến chủ đề nào, cứ nhắn mình nhé!`,
      reply_markup,
      includeInviteLog: false,
      inviteGroupUrl: groupUrl,
    };
  }

  return {
    text:
      `Chào${greetingName}! Mình là trợ lý AI của TripC & ${communityName}.${positioningLine}\n\nBạn cứ nhắn tự nhiên điều bạn đang quan tâm nhé (ví dụ: khu vực đáng sống tại Đà Nẵng, ẩm thực địa phương, kinh nghiệm du lịch Việt Nam). Mình sẽ tư vấn theo cẩm nang đã kiểm chứng và kết nối bạn với cộng đồng Facebook của tụi mình!\n\n📌 Dùng /community để lấy link tham gia nhóm Facebook hoặc /help để xem gợi ý nhanh.`,
    reply_markup,
    includeInviteLog: true,
    inviteGroupUrl: groupUrl,
  };
}

export interface TelegramBotRunnerOptions {
  onMessageIngested?: () => void;
  pollTimeoutSeconds?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Telegram Bot Long Polling worker: receives DM & Telegram Business updates without requiring a public HTTPS URL.
 * Disabled automatically when `TELEGRAM_BOT_TOKEN` is unset or `TELEGRAM_BOT_MODE=webhook`.
 */
export class TelegramBotRunner {
  private offset = 0;
  private stopped = false;
  private loopPromise: Promise<void> | null = null;
  private abortController: AbortController | null = null;
  private cachedWorkspaceId: string | null = null;
  private conflictLogged = false;
  private schemaEnsured = false;

  constructor(
    private readonly pool: Pool,
    private readonly options: TelegramBotRunnerOptions = {},
  ) {}

  private async ensurePlatformSchema(): Promise<void> {
    if (this.schemaEnsured || typeof (this.pool as { connect?: unknown }).connect !== 'function') return;
    this.schemaEnsured = true;
    await this.pool.query(
      `ALTER TABLE community_messages DROP CONSTRAINT IF EXISTS community_messages_platform_check;
       ALTER TABLE community_messages ADD CONSTRAINT community_messages_platform_check
         CHECK (platform IN ('facebook_comment', 'facebook_message', 'website_comment', 'manual', 'tripc_chat', 'telegram_message'));`,
    ).catch(() => {});
  }

  private get fetchFn(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  isEnabled(): boolean {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const mode = process.env.TELEGRAM_BOT_MODE?.trim().toLowerCase();
    return Boolean(token) && mode !== 'webhook';
  }

  private async callTelegram<T>(
    token: string,
    method: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; status: number; error_code?: number; description?: string; result?: T }> {
    const response = await this.fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal,
    });
    const parsed = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error_code?: number;
      description?: string;
      result?: T;
    };
    return {
      ok: Boolean(response.ok && parsed.ok),
      status: response.status,
      error_code: parsed.error_code,
      description: parsed.description,
      result: parsed.result,
    };
  }

  private async resolveWorkspaceId(): Promise<string | null> {
    const explicit = process.env.TELEGRAM_WEBHOOK_WORKSPACE_ID?.trim();
    if (explicit) return explicit;
    if (this.cachedWorkspaceId) return this.cachedWorkspaceId;

    const autoRow = (
      await this.pool.query<{ workspace_id: string }>(
        `SELECT workspace_id FROM agent_automation WHERE enabled = TRUE ORDER BY updated_at DESC LIMIT 1`,
      ).catch(() => ({ rows: [] as Array<{ workspace_id: string }> }))
    ).rows[0];
    if (autoRow?.workspace_id) {
      this.cachedWorkspaceId = autoRow.workspace_id;
      return autoRow.workspace_id;
    }

    const hubRow = (
      await this.pool.query<{ workspace_id: string }>(
        `SELECT workspace_id FROM community_hub_settings ORDER BY updated_at DESC LIMIT 1`,
      ).catch(() => ({ rows: [] as Array<{ workspace_id: string }> }))
    ).rows[0];
    if (hubRow?.workspace_id) {
      this.cachedWorkspaceId = hubRow.workspace_id;
      return hubRow.workspace_id;
    }
    return null;
  }

  async registerCommands(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return;
    await this.callTelegram(token, 'setMyCommands', { commands: BOT_COMMANDS }, AbortSignal.timeout(10_000)).catch(() => {});
  }

  async pollOnce(): Promise<{ processed: number; conflict?: boolean }> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token || process.env.TELEGRAM_BOT_MODE?.trim().toLowerCase() === 'webhook') {
      return { processed: 0 };
    }

    const timeoutSeconds = this.options.pollTimeoutSeconds ?? 20;
    this.abortController = new AbortController();
    const timeoutSignal = AbortSignal.timeout((timeoutSeconds + 10) * 1000);
    const signal = AbortSignal.any([this.abortController.signal, timeoutSignal]);

    const res = await this.callTelegram<TelegramUpdate[]>(
      token,
      'getUpdates',
      {
        offset: this.offset,
        timeout: timeoutSeconds,
        allowed_updates: ['message', 'business_message'],
      },
      signal,
    );

    if (res.status === 409 || res.error_code === 409) {
      if (!this.conflictLogged) {
        this.conflictLogged = true;
        console.warn(
          '[telegram-bot] Conflict (409): a webhook is active on Telegram. Run "npm run telegram:webhook -- --delete" in apps/api to use Long Polling, or set TELEGRAM_BOT_MODE=webhook.',
        );
      }
      return { processed: 0, conflict: true };
    }

    if (!res.ok) {
      throw new Error(`TELEGRAM_POLL_FAILED: (#${res.error_code ?? res.status}) ${res.description ?? 'request failed'}`);
    }

    this.conflictLogged = false;
    const updates = Array.isArray(res.result) ? res.result : [];
    if (updates.length > 0) {
      await this.ensurePlatformSchema();
    }
    let processed = 0;

    for (const update of updates) {
      const message = update.message ?? update.business_message;
      const text = message?.text?.trim();
      const author = message?.from;
      const chatId = message?.chat?.id;
      const command = parseTelegramCommand(text);

      if (
        !message?.message_id ||
        !text ||
        command === 'unknown' ||
        message.chat?.type !== 'private' ||
        !chatId ||
        !author ||
        author.id !== chatId ||
        author.is_bot
      ) {
        this.offset = Math.max(this.offset, update.update_id + 1);
        continue;
      }

      const workspaceId = await this.resolveWorkspaceId();
      if (!workspaceId) break;

      const connection = message.business_connection_id;
      const externalId = `${connection ?? 'bot'}:${chatId}:${message.message_id}`;
      const name = [author.first_name, author.last_name].filter(Boolean).join(' ') || 'Telegram user';
      const metadata: Record<string, string> = {};
      if (connection) metadata.business_connection_id = connection;
      if (author.username) metadata.username = author.username;

      // Typing feedback makes the conversation feel responsive before AI reply arrives.
      void this.callTelegram(
        token,
        'sendChatAction',
        {
          chat_id: String(chatId),
          action: 'typing',
          ...(connection ? { business_connection_id: connection } : {}),
        },
        AbortSignal.timeout(5_000),
      ).catch(() => {});

      if (command) {
        const inserted = (
          await this.pool.query<{ id: string }>(
            `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, status, metadata)
             SELECT $1, 'telegram_message', $2::text, $3, $4, $5, 'queued', $6
              WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1 AND platform='telegram_message' AND external_id=$2::text)
             RETURNING id`,
            [
              workspaceId,
              externalId,
              name.slice(0, 255),
              String(chatId),
              text.slice(0, 4000),
              JSON.stringify({ ...metadata, command }),
            ],
          )
        ).rows[0];

        if (!inserted?.id) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          continue;
        }

        let communityName = DEFAULT_COMMUNITY_NAME;
        let groupUrl = DEFAULT_FACEBOOK_GROUP_URL;
        let positioning: string | null = null;
        const hubSettings = (
          await this.pool.query<{
            community_name?: string | null;
            group_url?: string | null;
            positioning?: string | null;
          }>(
            `SELECT community_name, group_url, positioning FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1`,
            [workspaceId],
          ).catch(() => ({ rows: [] as Array<{ community_name?: string | null; group_url?: string | null; positioning?: string | null }> }))
        ).rows[0];
        if (hubSettings?.community_name) communityName = hubSettings.community_name;
        if (hubSettings?.group_url) groupUrl = hubSettings.group_url;
        positioning = hubSettings?.positioning ?? null;

        const cmdReply = buildCommandReply(command, { userName: name, communityName, groupUrl, positioning });
        const sendRes = await this.callTelegram<{ message_id?: number }>(
          token,
          'sendMessage',
          {
            chat_id: String(chatId),
            text: cmdReply.text,
            ...(connection ? { business_connection_id: connection } : {}),
            ...(cmdReply.reply_markup ? { reply_markup: cmdReply.reply_markup } : {}),
          },
          AbortSignal.timeout(15_000),
        );

        if (sendRes.ok) {
          await this.pool.query(
            `UPDATE community_messages SET status = 'replied', metadata = metadata || $3::jsonb, updated_at = now()
              WHERE workspace_id = $1 AND id = $2`,
            [
              workspaceId,
              inserted.id,
              JSON.stringify({
                reply_channel: 'telegram_bot',
                reply_message_id: sendRes.result?.message_id?.toString() ?? null,
                reply_text: cmdReply.text,
                replied_at: new Date().toISOString(),
                command,
              }),
            ],
          );
          if (cmdReply.includeInviteLog) {
            await this.pool.query(
              `INSERT INTO community_invite_logs (workspace_id, target_ref, display_name, channel, status, detail)
               VALUES ($1, $2, $3, 'telegram_community_invite', 'invited', $4)`,
              [
                workspaceId,
                `tg:${chatId}`.slice(0, 255),
                name.slice(0, 255),
                `Telegram /${command} invite (${cmdReply.inviteGroupUrl})`.slice(0, 500),
              ],
            ).catch(() => {});
          }
        }
        this.offset = Math.max(this.offset, update.update_id + 1);
        processed++;
        continue;
      }

      const inserted = (
        await this.pool.query<{ id: string }>(
          `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, metadata)
           SELECT $1, 'telegram_message', $2::text, $3, $4, $5, $6
            WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1 AND platform='telegram_message' AND external_id=$2::text)
           RETURNING id`,
          [workspaceId, externalId, name.slice(0, 255), String(chatId), text.slice(0, 4000), JSON.stringify(metadata)],
        )
      ).rows[0];

      this.offset = Math.max(this.offset, update.update_id + 1);
      if (inserted?.id) {
        processed++;
        this.options.onMessageIngested?.();
      }
    }

    return { processed };
  }

  start(): void {
    if (!this.isEnabled() || this.loopPromise) return;
    this.stopped = false;
    void this.registerCommands();
    console.log('[telegram-bot] Long Polling started');
    this.loopPromise = (async () => {
      while (!this.stopped) {
        try {
          const outcome = await this.pollOnce();
          if (outcome.conflict) {
            await new Promise((r) => setTimeout(r, 15_000));
          }
        } catch (error) {
          if (this.stopped) break;
          console.error('[telegram-bot]', (error as Error).message);
          await new Promise((r) => setTimeout(r, 4_000));
        }
      }
    })();
  }

  stop(): void {
    this.stopped = true;
    this.abortController?.abort();
  }
}

