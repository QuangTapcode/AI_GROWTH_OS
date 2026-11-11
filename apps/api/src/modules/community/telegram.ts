export const DEFAULT_FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1134282109069209';
export const DEFAULT_COMMUNITY_NAME = 'Cộng đồng Du lịch & Sống tại Việt Nam';
export const DEFAULT_BOT_USERNAME = 'tripc_community_bot';

export type TelegramCommand = 'start' | 'community' | 'help' | 'unknown';

export type TelegramUserLike = {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramMessageEntityLike = {
  type?: string;
  offset?: number;
  length?: number;
  user?: TelegramUserLike;
};

export type TelegramMessageLike = {
  message_id?: number;
  message_thread_id?: number;
  text?: string;
  entities?: TelegramMessageEntityLike[];
  reply_to_message?: { message_id?: number; from?: TelegramUserLike; text?: string };
  new_chat_members?: TelegramUserLike[];
  from?: TelegramUserLike;
  chat?: { id?: number; type?: string; title?: string };
};

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; url?: string }>>;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeCommunityGroupUrl(raw?: string | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_FACEBOOK_GROUP_URL;
  return /^https?:\/\//i.test(trimmed) ? trimmed : DEFAULT_FACEBOOK_GROUP_URL;
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
  message: TelegramMessageLike,
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

export function buildTelegramGroupWelcomeReply(
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
  const groupUrl = normalizeCommunityGroupUrl(options.groupUrl);
  const reply_markup = buildCommunityInviteKeyboard(groupUrl, false);
  const rawName = options.userName?.trim();
  const greetingName = rawName && rawName !== 'Telegram user' ? ` ${rawName}` : '';
  const chatTitle = options.chatTitle?.trim();

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

export function isEnglishTelegramMessage(text?: string | null): boolean {
  const value = text?.trim();
  if (!value) return false;
  if (/[\u00C0-\u1EF9]/u.test(value)) return false;
  if (/\b(chao|xin|ban|minh|toi|khong|duoc|nha|nhe|nhieu|cho|hoi|tu|van|cong|dong|nhom|tim|hieu|giup|cam|on|viet|nam|da|nang|gioi|thieu)\b/i.test(value)) {
    return false;
  }
  return /[a-z]/i.test(value);
}

export function isExplicitCommunityInquiry(text?: string | null): boolean {
  const value = text?.trim();
  if (!value) return false;
  return /\b(cộng\s*đồng|cong\s*dong|facebook|fb|group|nhóm|nhom|community|tham\s*gia|join|kênh|kenh)\b/iu.test(value);
}

export function buildCommunityInviteKeyboard(
  groupUrl?: string | null,
  english = false,
): TelegramInlineKeyboardMarkup | undefined {
  const normalized = normalizeCommunityGroupUrl(groupUrl);
  if (!/^https?:\/\//i.test(normalized)) return undefined;
  return {
    inline_keyboard: [
      [
        {
          text: english ? '👥 Join our Facebook Community' : '👥 Tham gia Cộng đồng trên Facebook',
          url: normalized,
        },
      ],
    ],
  };
}

export function buildTelegramCommandReply(
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
  const groupUrl = normalizeCommunityGroupUrl(options.groupUrl);
  const communityName = options.communityName?.trim() || DEFAULT_COMMUNITY_NAME;
  const rawName = options.userName?.trim();
  const greetingName = rawName && rawName !== 'Telegram user' ? ` ${rawName}` : '';
  const positioningLine = options.positioning?.trim() ? `\n✨ ${options.positioning.trim()}` : '';
  const reply_markup = buildCommunityInviteKeyboard(groupUrl, false);

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

export function composeTelegramRagReply(options: {
  question?: string | null;
  ragReply?: string | null;
  communityName?: string | null;
  groupUrl?: string | null;
  includeCommunityInvite?: boolean;
}): {
  text: string;
  reply_markup?: TelegramInlineKeyboardMarkup;
  invitedViaCta: boolean;
  inviteGroupUrl: string;
} {
  const question = options.question ?? '';
  const english = isEnglishTelegramMessage(question);
  const groupUrl = normalizeCommunityGroupUrl(options.groupUrl);
  const communityName = options.communityName?.trim() || DEFAULT_COMMUNITY_NAME;
  const includeInvite = Boolean(options.includeCommunityInvite);

  const raw = options.ragReply?.trim() ?? '';
  const unavailable =
    !raw ||
    raw.includes('The verified information needed for this question is unavailable') ||
    raw.includes('A human needs to review it');

  let text = raw;
  let invitedViaCta = false;

  if (unavailable) {
    if (english) {
      text = `Thanks for reaching out! Our verified guide doesn't have exact details on that specific question yet — feel free to tell me more about what you need, or ask locals & expats directly in our Facebook community (${communityName}): ${groupUrl}`;
    } else {
      text = `Cảm ơn bạn đã nhắn cho tụi mình! Về câu hỏi cụ thể này, cẩm nang hiện tại chưa có đủ thông tin chi tiết đã xác minh — bạn có thể chia sẻ thêm nhu cầu để mình gợi ý chủ đề gần nhất, hoặc tham gia ${communityName} trên Facebook để hỏi trực tiếp mọi người nhé: ${groupUrl}`;
    }
    invitedViaCta = true;
  } else {
    if (groupUrl !== DEFAULT_FACEBOOK_GROUP_URL && text.includes(DEFAULT_FACEBOOK_GROUP_URL)) {
      text = text.replaceAll(DEFAULT_FACEBOOK_GROUP_URL, groupUrl);
    }
    const alreadyHasGroupLink = text.includes('facebook.com/groups/') || text.includes(groupUrl);
    if (includeInvite && !alreadyHasGroupLink) {
      text = english
        ? `${text}\n\n💬 Want more local tips & real stories? Join our Facebook community (${communityName}): ${groupUrl}`
        : `${text}\n\n💬 Nếu bạn muốn tham khảo thêm kinh nghiệm thực tế và giao lưu cùng mọi người, mời bạn ghé ${communityName} trên Facebook nhé: ${groupUrl}`;
      invitedViaCta = true;
    } else if (alreadyHasGroupLink) {
      invitedViaCta = includeInvite;
    }
  }

  const attachButton =
    includeInvite ||
    invitedViaCta ||
    text.includes('facebook.com/groups/') ||
    text.includes(groupUrl) ||
    isExplicitCommunityInquiry(question);

  return {
    text,
    reply_markup: attachButton ? buildCommunityInviteKeyboard(groupUrl, english) : undefined,
    invitedViaCta: Boolean(includeInvite && (invitedViaCta || text.includes(groupUrl))),
    inviteGroupUrl: groupUrl,
  };
}

