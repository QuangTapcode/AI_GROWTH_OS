/**
 * Trích thông tin đặt bàn từ tin nhắn tiếng Việt (không cần LLM, chạy được cả khi LLM lỗi):
 * số điện thoại, số người, ngày giờ, tên khách, ý định đặt/ hủy/ xác nhận.
 * Mọi giờ là giờ Việt Nam (UTC+7).
 */
import { foldVietnamese } from "../merchant/sentiment";

const VN_OFFSET_MS = 7 * 3600_000;

export interface BookingSlots {
  customer_name?: string;
  customer_phone?: string;
  party_size?: number;
  booking_time?: string; // ISO UTC
  /** Đã biết giờ nhưng chưa rõ ngày (vd. "19h") — sẽ được hiểu là hôm nay/ mai khi xác nhận. */
  time_assumed_day?: boolean;
  notes?: string;
}

const NUMBER_WORDS: Record<string, number> = {
  mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10,
  "muoi mot": 11, "muoi hai": 12, "muoi lam": 15, "hai muoi": 20, "hai chuc": 20, "ba muoi": 30,
};

export function extractPhone(text: string): string | undefined {
  const compact = text.replace(/[\s.\-()]/g, "");
  const match = compact.match(/(?:\+?84|0)(3|5|7|8|9|2\d)\d{7,8}/);
  if (!match) return undefined;
  let phone = match[0].replace(/^\+?84/, "0");
  if (!/^0\d{9,10}$/.test(phone)) return undefined;
  // Di động VN 10 số (03/05/07/08/09); bàn 11 số (02x).
  if (/^0[35789]/.test(phone) && phone.length !== 10) phone = phone.slice(0, 10);
  return phone;
}

export function extractPartySize(text: string): number | undefined {
  const folded = foldVietnamese(text);
  const numeric =
    folded.match(/(\d{1,3})\s*(nguoi|ng\b|khach|pax|suat|mang|thanh vien|ban be)/) ??
    folded.match(/(?:ban|nhom|doan|team)\s*(?:cho\s*)?(\d{1,3})\b/) ??
    folded.match(/(?:cho|di|dat)\s*(\d{1,3})\s*(?:nguoi|ng\b)/);
  if (numeric) {
    const n = Number(numeric[1]);
    if (n >= 1 && n <= 500) return n;
  }
  const words = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length);
  for (const w of words) {
    if (new RegExp(`(?:^|\\s)${w}\\s+(nguoi|khach|pax)\\b`).test(folded)) return NUMBER_WORDS[w];
  }
  if (/\b(2 vo chong|vo chong|hai vo chong|cap doi|2 dua|hai dua)\b/.test(folded)) return 2;
  return undefined;
}

function localParts(now: Date) {
  const local = new Date(now.getTime() + VN_OFFSET_MS);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), weekday: local.getUTCDay(), h: local.getUTCHours(), min: local.getUTCMinutes() };
}

function toUtc(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m, d, h, min) - VN_OFFSET_MS);
}

const WEEKDAYS: Array<[RegExp, number]> = [
  [/\b(chu nhat|cn)\b/, 0],
  [/\b(thu 2|thu hai|t2)\b/, 1],
  [/\b(thu 3|thu ba|t3)\b/, 2],
  [/\b(thu 4|thu tu|t4)\b/, 3],
  [/\b(thu 5|thu nam|t5)\b/, 4],
  [/\b(thu 6|thu sau|t6)\b/, 5],
  [/\b(thu 7|thu bay|t7)\b/, 6],
];

/** Trả thời điểm UTC; `assumedDay` = true khi tin nhắn chỉ có giờ mà không có ngày. */
export function extractDateTime(text: string, now: Date): { at: Date; assumedDay: boolean } | undefined {
  const folded = foldVietnamese(text);
  // --- Giờ ---
  let hour: number | undefined;
  let minute = 0;
  const hm =
    folded.match(/\b(\d{1,2})\s*(?:h|g|gio|:)\s*(\d{2})\b/) ??
    folded.match(/\b(\d{1,2})\s*(?:h|g|gio)\s*(ruoi|kem)?\b/) ??
    folded.match(/\bluc\s*(\d{1,2})\b/);
  if (hm) {
    hour = Number(hm[1]);
    if (hm[2] === "ruoi") minute = 30;
    else if (hm[2] && /^\d{2}$/.test(hm[2])) minute = Number(hm[2]);
  }
  const evening = /\b(toi|chieu|dem)\b/.test(folded);
  const noon = /\btrua\b/.test(folded);
  if (hour !== undefined) {
    if (hour > 23 || minute > 59) return undefined;
    if (evening && hour < 12) hour += 12;
    else if (noon && hour < 5) hour += 12; // "1h trưa"
  }

  // --- Ngày ---
  const nowParts = localParts(now);
  let y = nowParts.y;
  let m = nowParts.m;
  let d = nowParts.d;
  let dayGiven = false;
  const dm = folded.match(/\b(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?\b/);
  if (dm && Number(dm[2]) >= 1 && Number(dm[2]) <= 12 && Number(dm[1]) >= 1 && Number(dm[1]) <= 31) {
    d = Number(dm[1]);
    m = Number(dm[2]) - 1;
    if (dm[3]) y = Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]);
    else if (toUtc(y, m, d, 23, 59).getTime() < now.getTime()) y += 1; // "5/1" khi đang tháng 12 → năm sau
    dayGiven = true;
  } else if (/\b(ngay kia|ngay mot|hom kia)\b/.test(folded)) {
    d += 2;
    dayGiven = true;
  } else if (/\b(mai|ngay mai)\b/.test(folded)) {
    d += 1;
    dayGiven = true;
  } else if (/\b(hom nay|toi nay|trua nay|chieu nay|sang nay)\b/.test(folded)) {
    dayGiven = true;
  } else {
    for (const [re, weekday] of WEEKDAYS) {
      if (re.test(folded)) {
        let diff = (weekday - nowParts.weekday + 7) % 7;
        const nextWeek = /\b(tuan sau|tuan toi)\b/.test(folded);
        if (nextWeek) diff += diff === 0 ? 7 : 7;
        d += diff;
        dayGiven = true;
        break;
      }
    }
    const onlyDay = !dayGiven ? folded.match(/\bngay\s+(\d{1,2})\b/) : null;
    if (onlyDay) {
      const day = Number(onlyDay[1]);
      if (day >= 1 && day <= 31) {
        d = day;
        if (toUtc(y, m, d, 23, 59).getTime() < now.getTime()) m += 1;
        dayGiven = true;
      }
    }
  }

  if (hour === undefined) {
    if (!dayGiven) return undefined;
    // Có ngày nhưng chưa có giờ: chưa đủ để giữ bàn — trả mốc 00:00 để biết khách đã nói ngày.
    return { at: toUtc(y, m, d, 0, 0), assumedDay: false };
  }
  let at = toUtc(y, m, d, hour, minute);
  let assumedDay = false;
  if (!dayGiven) {
    assumedDay = true;
    if (at.getTime() < now.getTime()) at = toUtc(y, m, d + 1, hour, minute);
  }
  return { at, assumedDay };
}

/** Có giờ cụ thể (không phải mốc 00:00 chỉ có ngày). */
export function hasClockTime(iso: string | undefined): boolean {
  if (!iso) return false;
  const local = new Date(Date.parse(iso) + VN_OFFSET_MS);
  return !(local.getUTCHours() === 0 && local.getUTCMinutes() === 0);
}

const NAME_STOPWORDS = new Set(["muon", "dat", "can", "hoi", "oi", "a", "nhe", "ban", "em", "la", "ten", "o", "va", "cho"]);

export function extractName(text: string): string | undefined {
  const patterns = [
    /(?:tên(?: mình| em| anh| chị| tôi)?(?: là)?|mình là|em là|tôi là|anh là|chị là)\s+(\p{Lu}\p{Ll}*(?:\s+\p{Lu}\p{Ll}*){0,3})/u,
    /(?:^|\s)(?:anh|chị|chi|cô|chú)\s+(\p{Lu}\p{Ll}*(?:\s+\p{Lu}\p{Ll}*){0,2})/u,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const name = m[1].trim();
      if (name.length >= 2 && !NAME_STOPWORDS.has(foldVietnamese(name))) return name.slice(0, 80);
    }
  }
  return undefined;
}

export function detectBookingIntent(text: string): boolean {
  const f = foldVietnamese(text);
  return /\b(dat ban|giu ban|dat cho|book ban|booking|dat truoc|giu cho|dat tiec|con ban|con cho|reserve|reservation|book (1|mot|ban|cho)|dat (\d+|mot|hai|ba|bon|nam) (ban|suat|cho))\b/.test(f);
}

export function detectCancel(text: string): boolean {
  const f = foldVietnamese(text);
  return /\b(huy|huy ban|khong dat nua|thoi khong dat|cancel|doi y roi|bo qua)\b/.test(f);
}

export type Confirmation = "yes" | "no" | null;
export function detectConfirmation(text: string): Confirmation {
  const f = foldVietnamese(text).replace(/[!.?,]/g, " ").trim();
  if (/^(ok|oke|okela|okie|uk|u|uh|um|vang|da|dung|dung roi|chuan|chot|xac nhan|yes|y|co|duoc|dong y|da dung|da vang|ok em|ok ban)(\s+(em|nhe|nha|a|luon|roi|ban|nhe em|di))*$/.test(f)) return "yes";
  if (/^(khong|ko|k|sai|chua dung|nham|khong phai|no)(\s|$)/.test(f)) return "no";
  return null;
}

export function extractSlots(text: string, now: Date, profileName?: string | null): BookingSlots {
  const slots: BookingSlots = {};
  const phone = extractPhone(text);
  if (phone) slots.customer_phone = phone;
  const party = extractPartySize(text);
  if (party) slots.party_size = party;
  const dt = extractDateTime(text, now);
  if (dt) {
    slots.booking_time = dt.at.toISOString();
    if (dt.assumedDay) slots.time_assumed_day = true;
  }
  const name = extractName(text);
  if (name) slots.customer_name = name;
  else if (profileName && profileName.trim() && !/^(facebook|instagram|zalo) user$/i.test(profileName.trim())) {
    // Tên hiển thị trên Messenger/ Zalo dùng làm mặc định, khách có thể sửa.
    slots.customer_name = profileName.trim().slice(0, 80);
  }
  const note = text.match(/(?:ghi chú|lưu ý|note|yêu cầu)\s*[:：]?\s*(.{3,200})/i);
  if (note) slots.notes = note[1].trim();
  else if (/sinh nhật|kỷ niệm|ghế em bé|ghe em be|xe lăn|phòng riêng|phong rieng|ăn chay|an chay/i.test(text)) slots.notes = text.trim().slice(0, 200);
  return slots;
}

export function formatLocal(iso: string): string {
  const local = new Date(Date.parse(iso) + VN_OFFSET_MS);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  const weekday = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"][local.getUTCDay()];
  return `${hh}:${mm} ${weekday} ${local.getUTCDate()}/${local.getUTCMonth() + 1}`;
}

/** Kiểm tra giờ hẹn so với giờ mở cửa; trả lý do nếu không hợp lệ. */
export function validateBookingTime(
  iso: string,
  now: Date,
  hours?: { open: string; close: string; closed_weekdays?: number[] },
): string | null {
  const at = Date.parse(iso);
  if (at < now.getTime() + 30 * 60_000) return "Giờ này đã qua hoặc quá gấp (cần đặt trước ít nhất 30 phút)";
  if (at > now.getTime() + 60 * 86400_000) return "Quán nhận đặt bàn trong vòng 60 ngày tới";
  if (!hours) return null;
  const local = new Date(at + VN_OFFSET_MS);
  if (hours.closed_weekdays?.includes(local.getUTCDay())) return "Hôm đó quán nghỉ";
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const [oh, om] = hours.open.split(":").map(Number);
  const [ch, cm] = hours.close.split(":").map(Number);
  const open = oh * 60 + om;
  let close = ch * 60 + cm;
  if (close <= open) close += 24 * 60; // mở qua nửa đêm
  const m = minutes < open && close > 24 * 60 ? minutes + 24 * 60 : minutes;
  // Nhận khách vào muộn nhất 60 phút trước giờ đóng cửa.
  if (m < open || m > close - 60) return `Quán nhận khách từ ${hours.open} đến trước ${hours.close} 1 tiếng`;
  return null;
}
