# Skills hỗ trợ tài liệu và lựa chọn bổ sung

Ngày khảo sát: 05/10/2026. Theo yêu cầu `$find-skills`, đã kiểm tra leaderboard trước và xác minh nguồn; không cần cài skill mới để hoàn thành bộ khung.

## Đã dùng trong lần bàn giao này

- `find-skills`: khảo sát kỹ năng sẵn có.
- `docx`: hướng dẫn đọc/trích nội dung kế hoạch DOCX; dùng .NET ZIP/XML vì môi trường shell không tìm thấy pandoc/Python trên PATH.
- `codebase-documenter`: cấu trúc README, trách nhiệm, diagrams và kiểm tra links.

## Lựa chọn bổ sung cho giai đoạn FE/UIUX

`frontend-design` từ repository chính thức `anthropics/skills` hướng dẫn thiết kế/triển khai frontend. Trang skill tại thời điểm khảo sát hiển thị khoảng 953 nghìn lượt cài và 179,5 nghìn GitHub stars; các số này thay đổi theo thời gian. Nguồn: [trang skill và thống kê](https://skills.sh/anthropics/skills/frontend-design), [repository gốc](https://github.com/anthropics/skills).

Lệnh tùy chọn khi đội muốn cài và đã có Node.js/npx:

```powershell
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

Chưa chạy lệnh cài. Skill hỗ trợ công việc của agent, không thay thế BA/QA/owner review hoặc contract của dự án. Không cần đưa skill này thành dependency bắt buộc của product.
