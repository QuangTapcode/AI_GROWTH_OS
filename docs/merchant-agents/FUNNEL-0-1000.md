# Phễu cộng đồng khách quen: từ 0 lên 1.000 thành viên trong 12 tuần (Agent 8)

## Kế hoạch theo tuần

Kế hoạch dùng đường cong chữ S: đầu tiên thành viên đến từ khách đang ghé quán, sau đó tăng nhờ hiệu ứng lan truyền. Các mốc dưới đây nằm trong `MILESTONE_SHARE` (`apps/api/src/modules/communityGrowth/funnel.ts`).

| Tuần | 1 | 2 | 4 | 6 | 8 | 10 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Thành viên (mục tiêu 1.000) | 50 | 120 | 300 | 450 | 650 | 820 | 1.000 |

Trạng thái tiến độ được tính như sau:

- **Vượt kế hoạch**: thực tế ≥ 110% kế hoạch.
- **Đúng tiến độ**: từ 90% đến dưới 110%.
- **Chậm tiến độ**: dưới 90%.

Số thực tế lấy từ `community_member_snapshots`, do Group Bot đo.

## 4 điểm chạm (đều đã chạy tự động)

| Điểm chạm | Ai làm | Cách làm | Giới hạn chống spam |
| --- | --- | --- | --- |
| Bàn ăn | Chủ quán in QR | Trang **Cộng đồng khách quen** tạo mã QR trỏ tới nhóm. Đặt QR trên bàn kèm câu "Vào nhóm nhận ưu đãi khách quen". | — |
| Bình luận Fanpage | Agent 6 | Trả lời bình luận an toàn, kèm lời mời vào Group và tin nhắn riêng mời tham gia. | 10–15 lời mời mỗi ngày; mỗi người chỉ mời 1 lần |
| Sau khi đặt bàn | Agent 7 | Tin nhắn chốt bàn kèm link nhóm khách quen. | 1 lần cho mỗi lượt đặt bàn |
| Trong nhóm | Agent 3/4 | Thứ 3 lúc 20h đăng mini game; thứ 6 lúc 20h đăng bình chọn món (thả cảm xúc). | 2 bài mỗi tuần |

## Nội dung kích hoạt gợi ý (Agent 8 bám theo các dạng bài này)

- **Mini game "Đoán món".** Đăng ảnh cận cảnh món, ai đoán đúng và tag bạn được tặng ưu đãi (lấy từ mục khuyến mãi trong Hồ sơ quán).
- **Bình chọn món tuần sau.** Thả ❤️ cho món A, 😆 cho món B. Món thắng được giảm giá tuần sau (chủ quán ghi vào mục khuyến mãi).
- **Hậu trường bếp.** Ảnh bếp sáng sớm, nguồn hải sản chợ Hàn. Bài dạng này tăng niềm tin.
- **Tri ân.** Cảm ơn thành viên thứ 100, 500, 1.000.

## Khi bị chậm tiến độ

1. Kiểm tra QR đã được đặt trên mọi bàn chưa. Đây thường là nguồn lớn nhất ở giai đoạn tuần 1–4.
2. Tăng `daily_invite_limit` của Group (tối đa 15) trong Community Hub.
3. Thêm một khuyến mãi dành riêng cho thành viên nhóm vào Hồ sơ quán. Agent 8 sẽ đưa khuyến mãi này vào bài.
