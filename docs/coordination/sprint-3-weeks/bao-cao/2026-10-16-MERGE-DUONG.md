# Merge toàn bộ nhánh duong — 16/10/2026

Nguồn: `origin/duong` tại `5647a9b87a57faa655dda89c279806b78e9da0a5`. Target: `main` local. Đã fetch GitHub trước merge. Không có conflict.

Việc gom báo cáo vào `bao-cao/` và đổi tên theo ngày được lưu riêng trong commit `16bb2d2` trước merge. Giữ nguyên toàn bộ thay đổi runtime/QQ-04/backend từ các lượt trước.

## Nội dung từ nhánh Dương

- Thêm [DU-01 Acceptance Criteria](../../../ba/acceptance/DU-01_TripC_Acceptance_Criteria.md), [DU-02 Field Dictionary](../../../ba/data-dictionary/DU-02_Field_Dictionary_Core.md), [DU-03 Source Preparation/Demo Checklist](../../../ba/tasks/DU-03_Source_Preparation_and_Demo_Checklist.md).
- Giữ việc xóa 7 tài liệu cũ của nhánh: `W1-AC-MATRIX.md`, `EVAL_RUBRIC_30_CASES.md`, `UAT_TENANT_DATASET.md`, `W1_HANDOVER_AND_GAP_REPORT.md`, `W1-PM-01.md`, `W1-PM-02.md`, `W1-PM-03.md`.
- Những link tới tài liệu bị xóa đã đổi thành nhãn lịch sử có chú thích, không tự gán nội dung tài liệu cũ sang tài liệu mới. Hai đường dẫn planning/operations trong backlog JSON chuyển sang sprint index và RISKS hiện hành. BA README bổ sung link tới ba tài liệu mới.

## Kiểm tra và giới hạn

Merge chỉ thay Markdown/JSON tài liệu, không đổi code hoặc dependencies, nên không chạy lại test runtime. Kiểm tra file merge, liên kết liên quan và JSON parse; giữ nguyên nội dung BA từ nguồn, không tự nghiệm thu DU-01/02/03.

DU-01 thêm công thức opportunity score và deadline cụ thể, trong khi QQ-04 hiện mới chọn grounded finding, chưa có score/deadline contract tương ứng. Đây là khoảng cần đối chiếu AC/contract trong review, không tự coi QQ-04 đạt toàn bộ AC mới.

DU-03 ghi một số nguồn/ảnh là `Verified`/có quyền sử dụng, nhưng lượt merge chưa có artifact/file/approval evidence xác nhận các nhãn đó. Đây là nội dung tài liệu BA cần reviewer kiểm tra; không promote thành business facts hoặc approved source/asset trong runtime.

Merge/fixes chỉ commit local, chưa push. Các báo cáo tiếp tục nằm trong `bao-cao/`, tên bắt đầu bằng ngày.
