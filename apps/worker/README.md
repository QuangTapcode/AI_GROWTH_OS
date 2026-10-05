# BE — Worker jobs

Owner: Mỹ (BE), Thiệu Quang peer-review; vùng sửa `apps/worker/**`. Package/lockfile và process riêng với API, job dài không nằm trong request web. Skeleton chưa có queue/worker chạy thật.

`src/jobs/`: ingestion, AI dispatch, publishing schedule, analytics sync và report/learning theo nhu cầu. `src/adapters/`: AI HTTP/CMS/GA4/GSC/queue/storage; fake adapters cho local tests. `tests/` và `tasks/` do BE quản.

## Làm độc lập

- Seed jobs/context synthetic vào DB local; dùng `AI_PROVIDER_MODE=stub`, `INTEGRATION_MODE=fake`.
- Kiểm tra progress/complete/cancel/timeout/retry/restart bằng fake xác định.
- Job bền vững có lease/heartbeat/attempt/result refs; nối lại AI run cũ theo idempotency.
- CMS timeout không rõ kết quả: reconciliation trước retry, không tạo post mới mù quáng.
- Publish recheck tenant/permission/source/approved version/hash tại execution.

Live mode dùng AI nội bộ và adapter credentials server-side; AI không giữ CMS/OAuth keys. Secrets/private content không vào logs.

W1-BE-01 bootstrap/run/check commands; W2-BE-03 durable AI queue; W3-BE-02 CMS scheduler; W3-BE-04 GA4/GSC snapshots; W4-BE-04 deploy/recovery/restore. Schedule lưu UTC, hiển thị theo một timezone pilot.


Ngôn ngữ: TypeScript; owner Mỹ, Thiệu Quang peer-review. CMS pilot là Next.js tối giản, publish job kiểm tra human approval/version và ghi mapping URL/idempotency. AI Python giao tiếp HTTP/JSON, không chạy chung runtime hay import source. [TEAM](../../docs/coordination/TEAM.md).
