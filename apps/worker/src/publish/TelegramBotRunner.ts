import type { Pool } from 'pg';
import type { TelegramInlineKeyboardMarkup } from './CommunityReplyRunner';

export const DEFAULT_FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1134282109069209';
export const DEFAULT_COMMUNITY_NAME = 'Cộng đồng Du lịch & Sống tại Việt Nam';
export const DEFAULT_BOT_USERNAME = 'tripc_community_bot';

const BOT_COMMANDS = [
  { command: 'start', description: 'Bắt đầu trò chuyện & nhận tư vấn du lịch' },
  { command: 'community', description: 'Nhận link tham gia Cộng đồng Facebook TripC' },
  { command: 'help', description: 'Xem hướng dẫn & chủ đề bot có thể hỗ trợ' },
];

export type TelegramCommand = 'start' | 'community' | 'help' | 'unknown';

type TelegramChat = { id?: number; type?: string; title?: string };
type TelegramUser = { id?: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
type TelegramMessageEntity = { type?: string; offset?: number; length?: number; user?: TelegramUser };
type TelegramMessage = {
  message_id?: number;
  message_thread_id?: number;
  text?: string;
  entities?: TelegramMessageEntity[];
  reply_to_message?: { message_id?: number; from?: TelegramUser; text?: string };
  new_chat_members?: TelegramUser[];
  business_connection_id?: string;
  from?: TelegramUser;
  chat?: TelegramChat;
};
export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  business_message?: TelegramMessage;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseTelegramCommand(text?: string | null, botUsername?: string | null): TelegramCommand | null {
  const trimmed = text?.trim();
  if (!trimmed || !trimmed.startsWith('/')) return null;
  const firstToken = trimmed.slice(1).split(/\s+/)[0] ?? '';
  const [rawCmd = '', rawTarget] = firstToken.split('@');
  const normalizedBot = botUsername?.trim().replace(/^@/, '').toLowerCase();
  if (rawTarget && normalizedBot && rawTarget.toLowerCase() !== normalizedBot) {
    return 'unknown';
  }
  const cmd = rawCmd.toLowerCase();
  if (!cmd) return 'unknown';
  if (cmd === 'start') return 'start';
  if (cmd === 'community' || cmd === 'congdong' || cmd === 'nhom' || cmd === 'group') return 'community';
  if (cmd === 'help' || cmd === 'menu' || cmd === 'trogiup' || cmd === 'tuvan') return 'help';
  return 'unknown';
}

export function analyzeTelegramGroupMessage(
  message: TelegramMessage,
  botIdentity: { id?: number | null; username?: string | null } = {},
):
  | { shouldRespond: false }
  | {
      shouldRespond: true;
      kind: 'command' | 'ping' | 'question' | 'bot_joined' | 'member_joined';
      command?: 'start' | 'community' | 'help';
      cleanedText?: string;
      memberNames?: string[];
    } {
  const normalizedBotUsername = botIdentity.username?.trim().replace(/^@/, '').toLowerCase() || null;
  const botId = typeof botIdentity.id === 'number' && Number.isFinite(botIdentity.id) ? botIdentity.id : null;

  if (Array.isArray(message.new_chat_members) && message.new_chat_members.length > 0) {
    const includesSelf = message.new_chat_members.some(
      (m) =>
        (botId !== null && m.id === botId) ||
        (normalizedBotUsername !== null && m.username?.toLowerCase() === normalizedBotUsername),
    );
    if (includesSelf) {
      return { shouldRespond: true, kind: 'bot_joined' };
    }
    const humanNames = message.new_chat_members
      .filter((m) => !m.is_bot)
      .map((m) => [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || (m.username ? `@${m.username}` : 'bạn mới'));
    if (humanNames.length > 0) {
      return { shouldRespond: true, kind: 'member_joined', memberNames: humanNames };
    }
    return { shouldRespond: false };
  }

  const text = message.text?.trim();
  if (!text) return { shouldRespond: false };

  const command = parseTelegramCommand(text, normalizedBotUsername);
  if (command === 'unknown') return { shouldRespond: false };
  if (command) {
    return { shouldRespond: true, kind: 'command', command, cleanedText: text };
  }

  let isMentioned = false;
  if (normalizedBotUsername) {
    const mentionRegex = new RegExp(`(^|[\\s,.;:!?()\\[\\]])@${escapeRegExp(normalizedBotUsername)}(?=$|[\\s,.;:!?()\\[\\]])`, 'i');
    const entityHit = Array.isArray(message.entities)
      ? message.entities.some((e) => {
          if (e.type !== 'mention' || typeof e.offset !== 'number' || typeof e.length !== 'number') return false;
          return text.slice(e.offset, e.offset + e.length).toLowerCase() === `@${normalizedBotUsername}`;
        })
      : false;
    isMentioned = entityHit || mentionRegex.test(text);
  }

  const replyFrom = message.reply_to_message?.from;
  const isReplyToBot = Boolean(
    replyFrom?.is_bot &&
      ((botId !== null && replyFrom.id === botId) ||
        (normalizedBotUsername !== null && replyFrom.username?.toLowerCase() === normalizedBotUsername) ||
        (botId === null && normalizedBotUsername === null)),
  );

  let stripped = text;
  if (normalizedBotUsername && isMentioned) {
    const stripRegex = new RegExp(`@${escapeRegExp(normalizedBotUsername)}(?=$|[\\s,.;:!?()\\[\\]])`, 'gi');
    stripped = text.replace(stripRegex, ' ').replace(/\s+/g, ' ').replace(/^[\s,.:;!?-]+/, '').trim();
  }

  const isBotAddressPhrase = /(?<![\p{L}\p{N}])bot(?![\p{L}\p{N}])/iu.test(stripped);

  if (!isMentioned && !isReplyToBot && !isBotAddressPhrase) {
    return { shouldRespond: false };
  }

  if (!/\p{L}|\p{N}/u.test(stripped)) {
    return { shouldRespond: true, kind: 'ping', cleanedText: text };
  }

  return { shouldRespond: true, kind: 'question', cleanedText: stripped };
}

export function buildGroupWelcomeReply(
  kind: 'ping' | 'bot_joined' | 'member_joined',
  options: {
    userName?: string | null;
    chatTitle?: string | null;
    memberNames?: string[];
    botUsername?: string | null;
    communityName?: string | null;
    groupUrl?: string | null;
  } = {},
): {
  text: string;
  reply_markup?: TelegramInlineKeyboardMarkup;
} {
  const handle = options.botUsername?.trim().replace(/^@/, '') || DEFAULT_BOT_USERNAME;
  const communityName = options.communityName?.trim() || DEFAULT_COMMUNITY_NAME;
  const groupUrl = normalizeGroupUrl(options.groupUrl);
  const rawName = options.userName?.trim();
  const greetingName = rawName && rawName !== 'Telegram user' ? ` ${rawName}` : '';
  const chatTitle = options.chatTitle?.trim();
  const reply_markup: TelegramInlineKeyboardMarkup | undefined = /^https?:\/\//i.test(groupUrl)
    ? { inline_keyboard: [[{ text: '👥 Tham gia Cộng đồng trên Facebook', url: groupUrl }]] }
    : undefined;

  if (kind === 'bot_joined') {
    return {
      text:
        `Chào cả nhà${chatTitle ? ` trong ${chatTitle}` : ''}! Mình là trợ lý AI của TripC & ${communityName} 🤖\n\nMọi người có thể trò chuyện với mình bất cứ lúc nào bằng cách:\n• Tag @${handle} kèm câu hỏi (vd: @${handle} Đà Nẵng có bãi biển nào đẹp?)\n• Hoặc bấm Reply trực tiếp vào tin nhắn của mình để hỏi tiếp\n• Nhắn /community để lấy link cộng đồng Facebook hoặc /help để xem gợi ý nhé!`,
      reply_markup,
    };
  }

  if (kind === 'member_joined') {
    const names = options.memberNames?.filter(Boolean).join(', ') || 'bạn mới';
    return {
      text:
        `Chào mừng ${names} gia nhập nhóm${chatTitle ? ` ${chatTitle}` : ''}! 🎉\n\nNếu cần gợi ý địa điểm du lịch, ẩm thực hay kinh nghiệm sống tại Việt Nam, bạn cứ tag @${handle} kèm câu hỏi (hoặc nhắn /help) để mình hỗ trợ ngay nhé!`,
      reply_markup,
    };
  }

  return {
    text:
      `Chào${greetingName}! Mình là trợ lý AI của TripC & ${communityName} đây 👋\n\nBạn cứ nhắn tự nhiên theo 1 trong 2 cách:\n• Tag @${handle} kèm điều bạn muốn hỏi (vd: @${handle} ăn gì ngon ở Đà Nẵng?)\n• Hoặc bấm Reply trực tiếp vào tin nhắn này của mình để trò chuyện tiếp!\n\n📌 Dùng /community để lấy link cộng đồng Facebook hoặc /help để xem hướng dẫn nhanh.`,
    reply_markup,
  };
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
  botId?: number;
  botUsername?: string;
}

/**
 * Telegram Bot Long Polling worker: receives DM, Telegram Business, and addressed Group updates
 * without requiring a public HTTPS URL. Disabled automatically when `TELEGRAM_BOT_TOKEN` is unset
 * or `TELEGRAM_BOT_MODE=webhook`.
 */
export class TelegramBotRunner {
  private offset = 0;
  private stopped = false;
  private loopPromise: Promise<void> | null = null;
  private abortController: AbortController | null = null;
  private cachedWorkspaceId: string | null = null;
  private conflictLogged = false;
  private schemaEnsured = false;
  private botId: number | null = null;
  private botUsername: string | null = null;
  private identityLoaded = false;

  constructor(
    private readonly pool: Pool,
    private readonly options: TelegramBotRunnerOptions = {},
  ) {
    if (typeof options.botId === 'number' && Number.isFinite(options.botId)) {
      this.botId = options.botId;
    }
    if (options.botUsername?.trim()) {
      this.botUsername = options.botUsername.trim().replace(/^@/, '').toLowerCase();
      this.identityLoaded = true;
    }
  }

  private async loadBotIdentity(): Promise<void> {
    if (this.identityLoaded) return;
    this.identityLoaded = true;

    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (this.botId === null && token) {
      const parsedId = Number(token.split(':')[0]);
      if (Number.isFinite(parsedId) && parsedId > 0) this.botId = parsedId;
    }
    const envUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '').toLowerCase();
    if (envUsername) {
      this.botUsername = envUsername;
      return;
    }
    if (token) {
      try {
        const me = await this.callTelegram<{ id?: number; username?: string }>(
          token,
          'getMe',
          {},
          AbortSignal.timeout(5_000),
        );
        if (me.ok && me.result) {
          if (typeof me.result.id === 'number' && Number.isFinite(me.result.id)) {
            this.botId = me.result.id;
          }
          if (me.result.username?.trim()) {
            this.botUsername = me.result.username.trim().replace(/^@/, '').toLowerCase();
            return;
          }
        }
      } catch {
        // Fall back to default handle below if Telegram API is temporarily unreachable.
      }
    }
    this.botUsername = DEFAULT_BOT_USERNAME;
  }

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
        const detail = res.description?.trim() || 'Conflict';
        const isOtherPoller = /other getUpdates/i.test(detail);
        console.warn(
          isOtherPoller
            ? `[telegram-bot] Conflict (409): ${detail}. Another machine/process is polling with the same TELEGRAM_BOT_TOKEN.`
            : `[telegram-bot] Conflict (409): ${detail}. Run "npm run telegram:webhook -- --delete" in apps/api to use Long Polling, or set TELEGRAM_BOT_MODE=webhook.`,
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
      if (
        !this.identityLoaded &&
        updates.some((u) => {
          const t = (u.message ?? u.business_message)?.chat?.type;
          return t === 'group' || t === 'supergroup';
        })
      ) {
        await this.loadBotIdentity();
      }
    }
    let processed = 0;

    for (const update of updates) {
      const message = update.message ?? update.business_message;
      const rawText = message?.text?.trim() ?? '';
      const author = message?.from;
      const chatId = message?.chat?.id;
      const chatType = message?.chat?.type;
      const isPrivate = chatType === 'private';
      const isGroup = chatType === 'group' || chatType === 'supergroup';

      if (!message?.message_id || !chatId || (!isPrivate && !isGroup) || author?.is_bot) {
        this.offset = Math.max(this.offset, update.update_id + 1);
        continue;
      }

      let command: TelegramCommand | null = null;
      let contentText = rawText;
      let instantGroupWelcome: { kind: 'ping' | 'bot_joined' | 'member_joined'; memberNames?: string[] } | null = null;

      if (isPrivate) {
        command = parseTelegramCommand(rawText, this.botUsername);
        if (!rawText || command === 'unknown' || !author || author.id !== chatId) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          continue;
        }
      } else {
        const groupDecision = analyzeTelegramGroupMessage(message, { id: this.botId, username: this.botUsername });
        if (!groupDecision.shouldRespond) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          continue;
        }
        if (groupDecision.kind === 'command') {
          command = groupDecision.command ?? null;
          contentText = groupDecision.cleanedText ?? rawText;
        } else if (groupDecision.kind === 'question') {
          contentText = groupDecision.cleanedText ?? rawText;
        } else {
          instantGroupWelcome = { kind: groupDecision.kind, memberNames: groupDecision.memberNames };
          contentText =
            groupDecision.cleanedText ||
            (groupDecision.kind === 'bot_joined'
              ? '[Bot đã tham gia nhóm]'
              : `[Thành viên mới: ${groupDecision.memberNames?.join(', ') ?? 'bạn mới'}]`);
        }
      }

      const workspaceId = await this.resolveWorkspaceId();
      if (!workspaceId) break;

      const connection = isPrivate ? message.business_connection_id : undefined;
      const externalId = `${connection ?? 'bot'}:${chatId}:${message.message_id}`;
      const name = (author ? [author.first_name, author.last_name].filter(Boolean).join(' ') : '') || 'Telegram user';
      const metadata: Record<string, unknown> = {};
      if (connection) metadata.business_connection_id = connection;
      if (author?.username) metadata.username = author.username;
      if (isGroup) {
        metadata.chat_type = chatType;
        if (message.chat?.title) metadata.chat_title = message.chat.title;
        if (author?.id) metadata.sender_id = String(author.id);
        metadata.reply_to_message_id = message.message_id;
        if (typeof message.message_thread_id === 'number') metadata.message_thread_id = message.message_thread_id;
      }

      // Typing feedback makes the conversation feel responsive before AI reply arrives.
      void this.callTelegram(
        token,
        'sendChatAction',
        {
          chat_id: String(chatId),
          action: 'typing',
          ...(connection ? { business_connection_id: connection } : {}),
          ...(typeof message.message_thread_id === 'number' ? { message_thread_id: message.message_thread_id } : {}),
        },
        AbortSignal.timeout(5_000),
      ).catch(() => {});

      if (command || instantGroupWelcome) {
        const tagMeta = command ? { command } : { group_event: instantGroupWelcome!.kind };
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
              contentText.slice(0, 4000),
              JSON.stringify({ ...metadata, ...tagMeta }),
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

        const instantReply = command
          ? buildCommandReply(command, { userName: name, communityName, groupUrl, positioning })
          : {
              ...buildGroupWelcomeReply(instantGroupWelcome!.kind, {
                userName: name,
                chatTitle: message.chat?.title,
                memberNames: instantGroupWelcome!.memberNames,
                botUsername: this.botUsername,
                communityName,
                groupUrl,
              }),
              includeInviteLog: false,
              inviteGroupUrl: groupUrl,
            };

        const sendRes = await this.callTelegram<{ message_id?: number }>(
          token,
          'sendMessage',
          {
            chat_id: String(chatId),
            text: instantReply.text,
            ...(connection ? { business_connection_id: connection } : {}),
            ...(instantReply.reply_markup ? { reply_markup: instantReply.reply_markup } : {}),
            ...(isGroup ? { reply_to_message_id: message.message_id, allow_sending_without_reply: true } : {}),
            ...(typeof message.message_thread_id === 'number' ? { message_thread_id: message.message_thread_id } : {}),
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
                reply_text: instantReply.text,
                replied_at: new Date().toISOString(),
                ...(command ? { command } : { group_event: instantGroupWelcome!.kind }),
              }),
            ],
          );
          if (instantReply.includeInviteLog && command) {
            await this.pool.query(
              `INSERT INTO community_invite_logs (workspace_id, target_ref, display_name, channel, status, detail)
               VALUES ($1, $2, $3, 'telegram_community_invite', 'invited', $4)`,
              [
                workspaceId,
                `tg:${chatId}`.slice(0, 255),
                name.slice(0, 255),
                `Telegram /${command} invite (${instantReply.inviteGroupUrl})`.slice(0, 500),
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
          [workspaceId, externalId, name.slice(0, 255), String(chatId), contentText.slice(0, 4000), JSON.stringify(metadata)],
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
    console.log('[telegram-bot] Long Polling started');
    this.loopPromise = (async () => {
      await this.loadBotIdentity();
      void this.registerCommands();
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

