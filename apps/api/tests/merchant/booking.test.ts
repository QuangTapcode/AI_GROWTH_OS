import { describe, expect, it } from "vitest";
import {
  detectBookingIntent,
  detectCancel,
  detectConfirmation,
  extractDateTime,
  extractName,
  extractPartySize,
  extractPhone,
  formatLocal,
  validateBookingTime,
} from "../../src/modules/booking/slots";
import { BookingConciergeService } from "../../src/modules/booking/concierge";
import { createFakeDb, profileRule } from "./fakeDb";

// Thứ Ba 24/11/2026 15:00 giờ Việt Nam
const NOW = new Date("2026-11-24T08:00:00Z");
const local = (iso: string) => formatLocal(iso);

describe("Trích thông tin đặt bàn tiếng Việt", () => {
  it("số điện thoại di động VN các dạng viết", () => {
    expect(extractPhone("sđt em 0905 123 456 nhé")).toBe("0905123456");
    expect(extractPhone("+84 905.123.456")).toBe("0905123456");
    expect(extractPhone("gọi 84905123456")).toBe("0905123456");
    expect(extractPhone("bàn 12 lúc 19h")).toBeUndefined();
  });

  it("số người", () => {
    expect(extractPartySize("cho mình 4 người")).toBe(4);
    expect(extractPartySize("đặt bàn 6")).toBe(6);
    expect(extractPartySize("nhóm 10 khách")).toBe(10);
    expect(extractPartySize("hai người thôi")).toBe(2);
    expect(extractPartySize("2 vợ chồng đi ăn")).toBe(2);
    expect(extractPartySize("19h tối nay")).toBeUndefined();
  });

  it("ngày giờ: tối nay, mai, thứ, dd/mm, giờ rưỡi", () => {
    expect(local(extractDateTime("tối nay 7h", NOW)!.at.toISOString())).toBe("19:00 Thứ 3 24/11");
    expect(local(extractDateTime("mai 18h30", NOW)!.at.toISOString())).toBe("18:30 Thứ 4 25/11");
    expect(local(extractDateTime("thứ 7 lúc 12h trưa", NOW)!.at.toISOString())).toBe("12:00 Thứ 7 28/11");
    expect(local(extractDateTime("ngày 5/12 lúc 6 giờ rưỡi tối", NOW)!.at.toISOString())).toBe("18:30 Thứ 7 5/12");
    expect(local(extractDateTime("chủ nhật 11:15", NOW)!.at.toISOString())).toBe("11:15 Chủ nhật 29/11");
  });

  it("chỉ có giờ đã qua → hiểu là ngày mai (đánh dấu assumedDay)", () => {
    const r = extractDateTime("đặt bàn lúc 10h", NOW)!;
    expect(local(r.at.toISOString())).toBe("10:00 Thứ 4 25/11");
    expect(r.assumedDay).toBe(true);
  });

  it("tên khách", () => {
    expect(extractName("tên mình là Nguyễn Văn An")).toBe("Nguyễn Văn An");
    expect(extractName("anh Minh đặt bàn")).toBe("Minh");
  });

  it("ý định, xác nhận, hủy", () => {
    expect(detectBookingIntent("Quán còn bàn tối nay không ạ")).toBe(true);
    expect(detectBookingIntent("cho em đặt bàn 4 người")).toBe(true);
    expect(detectBookingIntent("menu có món chay không")).toBe(false);
    expect(detectConfirmation("ok em")).toBe("yes");
    expect(detectConfirmation("Vâng ạ")).toBe("yes");
    expect(detectConfirmation("không, sai giờ")).toBe("no");
    expect(detectConfirmation("cho anh hỏi chỗ đậu xe")).toBeNull();
    expect(detectCancel("thôi hủy bàn nhé")).toBe(true);
  });

  it("giờ mở cửa và đặt trước tối thiểu 30 phút", () => {
    const hours = { open: "10:00", close: "22:00" };
    expect(validateBookingTime(new Date(NOW.getTime() + 10 * 60_000).toISOString(), NOW, hours)).toMatch(/quá gấp/);
    expect(validateBookingTime("2026-11-24T14:30:00Z", NOW, hours)).toMatch(/trước 22:00/); // 21:30 VN
    expect(validateBookingTime("2026-11-24T12:00:00Z", NOW, hours)).toBeNull(); // 19:00 VN
    expect(validateBookingTime("2026-11-25T01:00:00Z", NOW, { ...hours, closed_weekdays: [3] })).toMatch(/nghỉ/);
  });
});

/** DB giả giữ trạng thái hội thoại để chạy nhiều lượt như thật. */
function conciergeDb(settings: Record<string, unknown> = {}) {
  const conversations: Array<Record<string, any>> = [];
  const leads: Array<Record<string, any>> = [];
  const replies: string[] = [];
  const db = createFakeDb([
    profileRule({ opening_hours: { open: "10:00", close: "22:00" }, address: "12 Bạch Đằng, Hải Châu", ...settings }),
    [/SELECT id, state, slots, turns, last_message_at FROM booking_conversations/, (p) => conversations.filter((c) => c.contact_ref === p[2] && ["collecting", "awaiting_confirmation"].includes(c.state))],
    [/INSERT INTO booking_conversations/, (p) => (conversations.push({ id: `conv${conversations.length}`, platform: p[1], contact_ref: p[2], state: p[3], slots: JSON.parse(String(p[4])), turns: p[5], last_message_at: NOW.toISOString() }), [])],
    [/UPDATE booking_conversations SET state = \$2/, (p) => {
      const c = conversations.find((x) => x.id === p[0])!;
      Object.assign(c, { state: p[1], slots: JSON.parse(String(p[2])), turns: p[3] });
      return [];
    }],
    [/INSERT INTO booking_leads/, (p) => (leads.push({ id: `lead${leads.length}`, name: p[1], phone: p[2], party: p[4], time: p[5], status: p[7], deposit: p[8], ref: p[11] }), [{ id: `lead${leads.length - 1}` }])],
    [/INSERT INTO outbox_events/, (p) => (replies.push(JSON.parse(String(p[2])).text), [])],
  ]);
  return { db, conversations, leads, replies };
}

const msg = (id: string, content: string) => ({ id, platform: "facebook_message", author_contact: "psid-1", author_name: "Trần Thị Mai", content });

describe("Agent 7 — Booking Concierge (state machine nhiều lượt)", () => {
  it("hỏi từng thông tin còn thiếu → tóm tắt → khách OK → tạo booking chờ nhân viên xác nhận", async () => {
    const { db, leads, replies } = conciergeDb();
    const bot = new BookingConciergeService(db as any, () => NOW);
    const r1 = await bot.handleInbound("ws", msg("m1", "Cho em đặt bàn tối nay nhé"));
    expect(r1).toMatchObject({ handled: true, state: "collecting" });
    expect(replies[0]).toMatch(/mấy giờ/);

    await bot.handleInbound("ws", msg("m2", "7h tối, 4 người"));
    expect(replies[1]).toMatch(/số điện thoại/);

    const r3 = await bot.handleInbound("ws", msg("m3", "0905123456"));
    expect(r3.state).toBe("awaiting_confirmation");
    expect(replies[2]).toContain("19:00 Thứ 3 24/11");
    expect(replies[2]).toContain("4 người");
    expect(replies[2]).toContain("Trần Thị Mai"); // tên hồ sơ Messenger
    expect(replies[2]).toContain("0905123456");

    const r4 = await bot.handleInbound("ws", msg("m4", "OK em"));
    expect(r4).toMatchObject({ handled: true, state: "confirmed", booking_lead_id: "lead0" });
    expect(leads[0]).toMatchObject({ name: "Trần Thị Mai", phone: "0905123456", party: 4, status: "pending", deposit: 0 });
    expect(replies[3]).toMatch(/Nhân viên quán sẽ xác nhận/);
    expect(replies[3]).toContain("12 Bạch Đằng");
  });

  it("tin nhắn không phải đặt bàn → không xử lý (để agent hỏi-đáp trả lời)", async () => {
    const { db } = conciergeDb();
    const out = await new BookingConciergeService(db as any, () => NOW).handleInbound("ws", msg("m1", "Quán có món chay không ạ?"));
    expect(out.handled).toBe(false);
  });

  it("giờ ngoài giờ mở cửa → hỏi lại giờ khác", async () => {
    const { db, replies } = conciergeDb();
    await new BookingConciergeService(db as any, () => NOW).handleInbound("ws", msg("m1", "đặt bàn 2 người lúc 23h tối nay"));
    expect(replies[0]).toMatch(/Quán nhận khách từ 10:00/);
  });

  it("bàn đông vượt sức chứa → chuyển nhân viên (handoff)", async () => {
    const { db } = conciergeDb({ max_party_size: 20 });
    const out = await new BookingConciergeService(db as any, () => NOW).handleInbound("ws", msg("m1", "đặt bàn 40 người tối mai 18h"));
    expect(out.state).toBe("handoff");
  });

  it("bàn từ 8 khách cần cọc → gửi VietQR với mã tham chiếu", async () => {
    const { db, leads, replies } = conciergeDb({ deposit: { required_from_party_size: 8, amount_per_guest_vnd: 50000, bank_bin: "970436", bank_account: "0123456789", account_name: "QUAN MAU" } });
    const bot = new BookingConciergeService(db as any, () => NOW);
    await bot.handleInbound("ws", msg("m1", "đặt bàn 10 người mai 18h, sđt 0912345678"));
    await bot.handleInbound("ws", msg("m2", "ok"));
    expect(leads[0]).toMatchObject({ party: 10, deposit: 500000, status: "pending" });
    expect(leads[0].ref).toMatch(/^DC[A-Z2-9]{8}$/);
    expect(replies[1]).toContain("https://img.vietqr.io/image/970436-0123456789-compact2.png?amount=500000");
  });

  it("khách hủy giữa chừng → cancelled", async () => {
    const { db } = conciergeDb();
    const bot = new BookingConciergeService(db as any, () => NOW);
    await bot.handleInbound("ws", msg("m1", "cho đặt bàn 3 người"));
    const out = await bot.handleInbound("ws", msg("m2", "thôi hủy nhé"));
    expect(out.state).toBe("cancelled");
  });
});
