# Pilot TripC — baseline đã chốt cho W1-PM-01

Ngày 05/10/2026 · PM/PO/người nghiệm thu: **Quang Quang** · BA: **Dương** · QA: **Thanh**.

## Quyết định từ người dùng

| Hạng mục | Baseline |
| --- | --- |
| Business | TripC — khách hàng nội bộ đầu tiên; du lịch, khám phá địa phương và dịch vụ sinh sống tại điểm đến |
| Audience | Người nước ngoài nói tiếng Anh đang sống hoặc có kế hoạch sống tại Đà Nẵng, đặc biệt expat |
| Market/location labels | Đà Nẵng; Sơn Trà, Hải Châu, Mỹ Khê theo vùng nội dung đã chọn, không tự giả định là phân loại hành chính hiện hành |
| Content language | English (`en`); nguồn có thể EN/VI, facts giữ provenance trước diễn đạt English |
| Topic priority | Housing/living areas ưu tiên; coworking, gym, food, events |
| Website/CMS | **Website pilot + CMS tối giản TypeScript/Next.js**, blog English và landing page với form nhận thông tin; chưa có website/URL hoạt động |
| Management app | Next.js ở `apps/web/`; website public tách `apps/pilot/`; CMS logic/API ở BE, AI Python |
| Publication | Con người duyệt content version/hash trước publish; sửa sau duyệt phải duyệt lại |
| Primary conversion | **Gửi form nhận thông tin thành công**, thay Signup account của trao đổi trước |
| Tracking | GA4 + Search Console + UTM, đo traffic/channel/content/campaign/conversion |
| PM/PO/team | Roster tên tại [TEAM](TEAM.md); Quang Quang kiêm AI/PM/PO, Thanh làm hai lane QA |

Lựa chọn WordPress trước đã được người dùng mở lại và thay bằng Next.js. Không triển khai WordPress adapter/hosting trong scope hiện tại.

## Đầu ra website tối thiểu và owner

- Tiến: `apps/pilot/` với blog index, article page, landing page/form UX, public routes/meta/sitemap/tracking/experiment integration; package/lockfile riêng để không chung app quản trị.
- Huyền: editor/approval/preview trong `apps/web/`, UI flows theo TEAM; Trường handoff blog/landing/form/success/error states.
- Thiệu Quang: auth/role/contracts/DB policies và migration review; Mỹ: minimal CMS publication/scheduler/slug/version/idempotency, public published-content API, form persistence/events, GA4/GSC integration.
- AI Quang Quang: English drafts/RAG/evidence/quality; human PO Quang Quang duyệt theo audit, Thanh kiểm chứng facts/critical cases độc lập.

CMS chỉ cần draft→review→approve→published, content/meta/slug/version và lịch xuất bản theo M10; public API không lộ draft/evidence/private sources. Không xây một CMS thương mại đầy đủ. Một page pilot dùng experiment hai title/CTA variants.

## Conversion và KPI

Conversion tính khi form validation đạt và backend xác nhận lưu một submission thành công. `submission_id`/idempotency chống submit/event trùng; `generate_lead` là GA4 event đề xuất cho form/request information ([Google](https://support.google.com/analytics/answer/9267735?hl=en-EN)). Email/consent lưu riêng server-side, không vào GA4 parameters/UTM/URLs.

KPI sản phẩm: Incremental Qualified Traffic; KPI pilot trực tiếp: traffic theo nguồn/content, qualified-traffic proxy, số form thành công và tỷ lệ session→form. Không mặc định form lead là account Signup hoặc khách hàng đã mua. Định nghĩa qualifier/range/attribution và numeric targets do Dương/Quang Quang chốt ở W1-BA-02; chưa có baseline/tỷ lệ mục tiêu để cam kết tăng trưởng.

Qualifier đề xuất: session có trang English thuộc topic expat Đà Nẵng và một engagement/CTA signal được định nghĩa rõ. Đây là proxy hành vi, không chứng minh quốc tịch/intent mọi visitor. User property/IP không được tự dùng để khẳng định người đó là expat.

GA4/GSC property/domain/history hiện chưa có đầu vào được cung cấp. Tuần 1 dựng public pilot và tracking/property verification sớm; GSC site mới có thể thiếu search data. Connector nghiệm thu bằng quyền/probe/live data thực tế khi có, ghi delayed/empty đúng và không dùng synthetic data thay live connector. [Nguồn Google về site mới](https://support.google.com/webmasters/answer/96568?device=c&hl=en).

## Dataset baseline

Nguồn được giao tự tìm và gợi ý: chọn seed corpus ở [SOURCES](SOURCES.md) gồm official tourism, direct housing/coworking/gym providers. [PILOT_DATASET.json](PILOT_DATASET.json) ghi URLs/status/provenance; đã khảo sát nguồn, **chưa crawl corpus hoặc duyệt facts thực tế**.

Dataset chia bốn loại: business context TripC do PO xác nhận; external facts/research có nguồn và review; live pilot events/metrics khi website hoạt động; synthetic QA/eval riêng có nhãn. Tối thiểu 30 eval cases là đầu ra W1-AI-03 với Thanh, không phải task này đã xây.

## Dependencies và bàn giao

Ngày 2 chốt estimates/limits/hosting/runtime ở W1-PM-02/W1-BE-01. Mục tiêu: pilot shell/tracking/role nền tảng ngày 5; English content/approval ngày 10–11; publish ngày 12; analytics ngày 14; one-page experiment ngày 17; UAT ngày 19 và release ngày 20.

Domain/URL/deployment, property IDs/OAuth/service accounts, crawl limits và verified facts sẽ được kỹ thuật/BA tạo trong các task triển khai. Chúng chưa tồn tại nhưng không còn thiếu quyết định lựa chọn pilot của W1-PM-01. Không tự cam kết bốn tuần khả thi trước estimate đội thực tế.
