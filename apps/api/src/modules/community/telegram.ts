export const DEFAULT_FACEBOOK_GROUP_URL = 'https://www.facebook.com/groups/1134282109069209';
export const DEFAULT_COMMUNITY_NAME = 'Cộng đồng Du lịch & Sống tại Việt Nam';

export type TelegramCommand = 'start' | 'community' | 'help' | 'unknown';

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; url?: string }>>;
};

export function normalizeCommunityGroupUrl(raw?: string | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_FACEBOOK_GROUP_URL;
  return /^https?:\/\//i.test(trimmed) ? trimmed : DEFAULT_FACEBOOK_GROUP_URL;
}

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

