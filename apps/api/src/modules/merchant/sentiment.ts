/**
 * Phân loại nhanh cảm xúc / rủi ro thương hiệu cho bình luận và review tiếng Việt (chạy không cần LLM,
 * dùng làm "cầu chì" trước khi AI tự trả lời công khai).
 *
 * - crisis: nguy cơ "phốt" (an toàn thực phẩm, lừa đảo, dọa báo chí/ kiện) → không tự trả lời, báo chủ quán ngay.
 * - negative: chê, phàn nàn → soạn nháp, chờ chủ quán duyệt.
 * - spam: quảng cáo, link lạ → bỏ qua (không trả lời).
 * - positive / neutral → được tự trả lời.
 */
export type SentimentLabel = "positive" | "neutral" | "negative" | "crisis" | "spam";

export interface SentimentResult {
  label: SentimentLabel;
  score: number; // âm = tiêu cực
  matched: string[];
}

export function foldVietnamese(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

// Mọi cụm từ viết không dấu (so khớp trên văn bản đã bỏ dấu).
const CRISIS = [
  "ngo doc", "dau bung", "tieu chay", "non mua", "di ung nang", "nhap vien", "cap cuu",
  "lua dao", "chat chem", "an cuop", "boc phot", " phot ", "tay chay", "len bao", "bao cong an", "se kien", "kien ra toa", "con kien",
  "con gian", "con chuot", "con ruoi", "con sau", "co doi", "toc trong", "ve sinh kem", "ban thiu", "bi thiu", "oi thiu", "hu thiu",
  "do an thiu", "thiu roi", "mui hoi thoi", "ban kinh khung", "an xong bi",
];
const NEGATIVE = [
  "do te", "qua te", "rat te", "te hai", "te nhat", "that vong", "chan qua", "chan that", "nhat chan", "khong ngon", "chang ngon", "do qua", "do lam",
  "lau qua", "cho lau", "doi lau", "cham qua", "phuc vu cham", "thai do te", "thai do kem", "thai do khong tot", "thai do lam loi", "khong lich su", "khinh khach", "cau co",
  "dat qua", "mac qua", "khong xung", "khong dang", "man qua", "nhat qua", "nguoi lanh", "bi nguoi", "con song", "dai qua",
  "khong bao gio quay lai", "khong quay lai", "lan cuoi", "1 sao", "mot sao", "do ban", "ban qua", "rat ban", "on ao", "nong buc", "chat choi",
];
const POSITIVE = [
  "ngon", "tuyet", "xuat sac", "tot", "thich", "se quay lai", "quay lai lan nua", "dinh", "hai long", "nhiet tinh",
  "chu dao", "de thuong", "sach se", "dep", "chill", "dang tien", "hop ly", "10 diem", "5 sao", "recommend", "khen",
];
const NEGATIONS = ["khong ", "chang ", "cha ", "khong he ", "chua "];
const SPAM = [
  "kiem tien", "vay tien", "vay von", "casino", "ca cuoc", "nha cai", "tai xiu", "18+", "inbox minh de nhan",
  "click link", "follow cheo", "tang follow", "ban tai khoan", "giam can nhanh",
];

function count(haystack: string, needles: string[]): string[] {
  return needles.filter((n) => haystack.includes(n));
}

export function classifySentiment(text: string, rating?: number | null): SentimentResult {
  const folded = ` ${foldVietnamese(text)} `;
  const spam = count(folded, SPAM);
  const hasLink = /https?:\/\/|www\.|bit\.ly|t\.me\//.test(folded);
  if (spam.length > 0 || (hasLink && /\b(kiem|vay|free|mien phi|uu dai soc)\b/.test(folded))) {
    return { label: "spam", score: 0, matched: spam };
  }
  const crisis = count(folded, CRISIS);
  if (crisis.length > 0) return { label: "crisis", score: -10, matched: crisis };

  let score = 0;
  const matched: string[] = [];
  for (const word of count(folded, NEGATIVE)) {
    // "khong chan", "chang te": phủ định của từ chê thì không tính là chê.
    if (NEGATIONS.some((neg) => folded.includes(`${neg}${word}`))) continue;
    score -= 2;
    matched.push(word);
  }
  for (const word of count(folded, POSITIVE)) {
    if (NEGATIONS.some((neg) => folded.includes(`${neg}${word}`))) {
      score -= 2; // "không ngon", "chưa hài lòng"
      matched.push(`khong ${word}`);
      continue;
    }
    score += 1;
    matched.push(word);
  }
  if (typeof rating === "number" && rating > 0) {
    if (rating <= 2) score -= 4;
    else if (rating === 3) score -= 1;
    else if (rating >= 4) score += 1;
  }
  const label: SentimentLabel = score <= -2 ? "negative" : score >= 1 ? "positive" : "neutral";
  return { label, score, matched };
}
