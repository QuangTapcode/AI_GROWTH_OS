# Phạm vi MVP 8 tuần và quyết định cần chốt

Nguồn: PRD v1.0 do người dùng cung cấp và kế hoạch 8 tuần ngày 04/10/2026. Mã M01–M30 dưới đây lấy từ **bảng kế hoạch**, không phải số thứ tự module trong PRD.

Kế hoạch là baseline thực thi đề xuất cho 8 tuần; PRD định hướng sản phẩm dài hạn. Chênh lệch phải được PO chốt thành decision record, không âm thầm coi cả PRD đã nằm trong MVP.

## 1. Bản đồ module

| Mã | Module | Tuần / mức MVP | Vùng triển khai chủ yếu |
| --- | --- | --- | --- |
| M01 | Organization, Workspace, RBAC | 1–2; đầy đủ cơ bản | BE identity/workspaces; FE workspace/settings |
| M02 | Business onboarding và brand | 2; cơ bản | BE business; FE onboarding; AI context |
| M03 | Knowledge/source lifecycle | 2; PDF text và URL | BE knowledge/worker ingestion; AI RAG; FE knowledge |
| M04 | Growth goals/measurement settings | 2 và 6; cơ bản | BE goals/measurement; FE goal setup |
| M05 | Market intelligence/research | 3; cơ bản | AI research; BE jobs; FE research |
| M06 | Opportunity engine/board | 3; cơ bản | AI scoring; BE opportunities; FE board |
| M07 | Growth strategy/action plan | 3; plan/task đơn giản | AI strategy; BE plans/tasks; FE action board |
| M08 | Content intelligence/brief | 4; cơ bản | AI brief; BE briefs; FE brief editor |
| M09 | AI Content Factory | 4; SEO article và social draft | AI content; BE content/version/jobs; FE editor |
| M10 | Repurposing/localization | 5; article → Facebook draft | AI variants; BE lineage; FE variants |
| M11 | Governance/quality/approval | 5; duyệt bắt buộc | BE state machine/audit; AI quality; FE review |
| M12 | SEO keyword/topic clusters | Sau MVP | Chưa triển khai |
| M13 | Programmatic local SEO | Sau MVP | Chưa triển khai |
| M14 | Internal linking/SEO audit | Sau MVP | Chưa triển khai |
| M15 | SEO optimizer/decay/refresh/recycling | Sau MVP | Chưa triển khai |
| M16 | Calendar/website publishing | 6; một CMS | BE worker/CMS; FE calendar |
| M17 | Social/newsletter/channel adaptation | Sau MVP | Facebook draft ở M10, không phải social publish |
| M18 | Community growth/intent radar | Sau MVP | Chưa triển khai |
| M19 | Traffic/UTM/attribution | 6; UTM/conversion cơ bản | BE measurement; FE mapping/settings |
| M20 | Analytics/Command Center | 6–7; GA4/GSC cơ bản | BE sync/metrics; FE dashboard |
| M21 | AI Growth Analyst/reports | 7; report có evidence | AI analyst; BE report; FE report |
| M22 | Experiment Engine | Sau MVP | Chưa triển khai |
| M23 | Learning/opportunity graph | Sau MVP | Chưa triển khai |
| M24 | Competitor intelligence | Sau MVP | Chưa triển khai |
| M25 | Agents/Growth Orchestrator | 3; workflow tuần tự, job status | BE durable jobs; AI pipeline tuần tự |
| M26 | Autonomous rules/confidence | Sau MVP | Approval vẫn bắt buộc; output có giải thích/evidence cơ bản |
| M27 | Billing/subscriptions/AI credits | Sau MVP | MVP chỉ cost/usage logging, không billing production |
| M28 | Integration settings/API | 2–6; CMS/GA4/GSC | BE OAuth/adapters; FE integration settings |
| M29 | Admin/notifications/security/operations | 1–8; tối thiểu | BE audit/RBAC/backup/monitoring |
| M30 | AI evaluation/observability | 1–8 | AI eval/traces/cost; QA2 kiểm chứng |

## 2. Các chênh lệch cần PO/đội xác nhận

| ID | Chênh lệch | Baseline để triển khai | Quyết định phải ghi nhận |
| --- | --- | --- | --- |
| D01 | PRD có Facebook publishing khi hỗ trợ; kế hoạch dời social publish | Chỉ Facebook draft/export, publish một CMS | PO chấp nhận phần giảm scope; mở social publish bằng backlog riêng |
| D02 | PRD có SEO optimization; M12–M15 dời sau | Nội dung có title/meta/headings/FAQ cơ bản trong M09 | Chốt quality rubric tối thiểu, không nghiệm thu full SEO engine |
| D03 | Bảng M03 chỉ PDF text/URL; nhiệm vụ tuần 2 nhắc Docs/text | PDF có text + URL; chưa bao gồm OCR hoặc Google Docs connector | PO chốt định dạng/giới hạn ingestion trước estimate |
| D04 | PRD đề xuất Next.js API chung; yêu cầu hiện tại cần tách FE/BE | Hai app Next.js riêng, AI HTTP service riêng, BE worker riêng | BE/FE/AI chốt deployment và contract tuần 1 |
| D05 | PRD nhiều autonomous agents; kế hoạch workflow tuần tự | AI tạo và gợi ý, người duyệt; BE quản job/publish | Không tăng sang autonomous execution trong MVP |
| D06 | Chỉ số growth PRD sau 30/90 ngày | Thu thập baseline, qualified traffic, conversion và evidence | Chốt cách đo; tăng traffic không là điều kiện nghiệm thu code |

Các quyết định này hiện là đề xuất minh bạch, chưa phải phê duyệt của PO. BA lưu từng quyết định đã chốt vào `docs/ba/processes/DEC-xxx.md`; không cần chờ chốt mọi quyết định mới viết stories/mocks không phụ thuộc.

## 3. Quy tắc nghiệp vụ bắt buộc đưa vào AC

- Tenant isolation ở API, DB/storage/vector search; role nghiệp vụ Owner/Admin/Growth Manager/Content Manager/Editor/Viewer cần bảng quyền hành động cụ thể.
- Knowledge có version, trạng thái review/verified/outdated/deleted và provenance. RAG chỉ dùng nguồn đã được phép và đúng workspace.
- Thu hồi/xóa nguồn loại khỏi truy hồi ngay, vô hiệu hóa cache và xử lý artifacts phát sinh theo policy; kiểm tra quyền lại trước publish nếu job đã chạy lâu.
- AI không tự thêm giá, giờ mở cửa, availability, địa chỉ, features, testimonial hay statistics khi không có fact được xác minh.
- Duyệt gắn với **content version/hash**. Chỉnh sửa draft đã duyệt làm approval cũ mất hiệu lực; job publish phải recheck approval/permissions tại execution.
- Sửa cùng version trả conflict; không ghi đè âm thầm khi editor autosave đồng thời.
- Publish/schedule có timezone workspace, timestamp UTC, idempotency, retry/cancel và audit. Hỗ trợ update/unpublish tùy CMS đã chọn, ghi support matrix.
- Analytics phân biệt zero, missing, partial và delayed; giữ property/timezone/range/source provenance; không thay missing bằng số 0.
- Report chỉ dùng số liệu input đã đối chiếu; % thay đổi khi baseline 0/missing phải hiện không tính được.
- Consent/tracking được mô tả; OAuth revoke làm integration chuyển trạng thái rõ ràng; credentials được bảo vệ và không vào logs.

## 4. Gates và ngưỡng

G2: workspace/brand/goals/knowledge có phân quyền. G5: research → brief → draft → approval thật. G7: một CMS thật, analytics đối chiếu được, report có evidence. G8: UAT/regression, không còn critical/high của quyền hoặc luồng chính, backup restore và rollback đã thử.

AI/Tester 2 chốt dataset và phương pháp ở tuần 2. Ngưỡng đề xuất từ kế hoạch: toàn bộ critical safety cases đạt, ít nhất 90% fact/retrieval cases chuẩn đạt, số liệu report mẫu khớp input. PO chốt trên dataset cụ thể; không dùng AI tự chấm làm bằng chứng duy nhất. API p95, tải pilot, job timeout/cost cap phải được đội đặt số cụ thể trước kiểm thử hiệu năng.
