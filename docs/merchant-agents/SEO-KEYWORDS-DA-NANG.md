# Từ khóa SEO địa phương cho quán ăn và du lịch Đà Nẵng (Agent 5)

Agent 5 lấy từ khóa từ trường `seo_keywords` trong **Hồ sơ quán**. Mỗi câu trả lời review chèn **1** từ khóa và mỗi Local Post chèn **1–2** từ khóa. Nếu chèn nhiều hơn, câu sẽ đọc như spam và Google có thể đánh giá thấp. Khi hồ sơ chưa có từ khóa, hệ thống dùng từ khóa mặc định theo loại hình và quận (`seoKeywords()` trong `apps/api/src/modules/merchant/profile.ts`).

Bảng dưới đây là danh sách để chọn. Mỗi quán chỉ nên chọn 6–10 từ khóa khớp đúng món và vị trí thật của quán.

| Nhóm | Từ khóa |
| --- | --- |
| Món đặc sản | bún chả cá Đà Nẵng · mì Quảng Đà Nẵng · bánh tráng cuốn thịt heo Đà Nẵng · bánh xèo Đà Nẵng · gỏi cá Nam Ô · bê thui Cầu Mống · hải sản Đà Nẵng · ốc Đà Nẵng · chè Liên Đà Nẵng · bánh canh ruộng Đà Nẵng |
| Theo khu vực | quán ăn ngon Hải Châu · quán ăn Sơn Trà · hải sản Mân Thái · quán ăn gần cầu Rồng · quán ăn gần chợ Hàn · quán ăn gần biển Mỹ Khê · ăn đêm Đà Nẵng · quán ăn Ngũ Hành Sơn |
| Theo nhu cầu | quán ăn gia đình Đà Nẵng · nhà hàng tiếp khách Đà Nẵng · quán nhậu bình dân Đà Nẵng · quán ăn có phòng riêng Đà Nẵng · quán ăn cho khách du lịch Đà Nẵng · quán ăn sáng Đà Nẵng |
| Cà phê | cà phê view biển Đà Nẵng · cà phê làm việc Đà Nẵng · cà phê muối Đà Nẵng · quán cafe đẹp Hải Châu |
| Du lịch, tour | tour Bà Nà Hills · tour Hội An từ Đà Nẵng · tour Cù Lao Chàm · du lịch Sơn Trà · thuê xe máy Đà Nẵng |

Một số nguyên tắc khi chọn từ khóa:

- **Chỉ dùng món quán thật sự bán.** Agent không được nhắc món không có trong thực đơn.
- **Ưu tiên cụm "món + khu vực" hơn cụm chung chung.** Ví dụ "bún chả cá Hải Châu" có khả năng lên Top 3 Map Pack cao hơn "quán ăn ngon".
- **Xem lại sau mỗi 4 tuần.** Đối chiếu với mục *Hiệu suất* trong Google Business Profile, cụ thể là các truy vấn khách đã dùng để tìm thấy quán.
