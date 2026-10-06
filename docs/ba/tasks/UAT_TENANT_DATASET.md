# TẬP DỮ LIỆU UAT: ĐẶC TẢ HAI TENANT PILOT (HOSPITALITY \& F\&B)

* Dự án: AI Growth OS (TripC - Expat tại Đà Nẵng)



* Giai đoạn: Ngày 3–4 (W1) - Thiết lập dữ liệu kiểm thử UAT



* Mục tiêu: Cung cấp tập dữ liệu đầu vào biệt lập cho 2 Tenant để kiểm tra khả năng phân tách workspace, kiểm duyệt nguồn (Verified) và tính chính xác của AI RAG.

### 

### TENANT 1: LƯU TRÚ \& CĂN HỘ CHO EXPAT (HOSPITALITY)

* Mã Workspace: tenant-hosp-dn-01



* Lĩnh vực: Cho thuê căn hộ dài hạn, dịch vụ lưu trú cao cấp hướng đến chuyên gia nước ngoài và digital nomad tại khu vực An Thượng, Mỹ Khê, Đà Nẵng.



* Bộ dữ liệu nguồn (Sources chuẩn bị cho UAT):



&#x09;-Tài liệu 1 (hosp-source-01.pdf): Bảng giá và chính sách cho thuê căn hộ dịch vụ 1-2 phòng ngủ tại khu vực An Thượng (Giá dao động từ 500 USD - 900 USD/tháng, đã bao gồm internet tốc độ cao, dọn phòng tuần 2 lần). Trạng thái: Verified.



&#x09;-Tài liệu 2 (hosp-source-02.md): Quy định đặt cọc, thanh toán và hợp đồng thuê nhà tối thiểu 6 tháng dành cho người nước ngoài tại Đà Nẵng. Trạng thái: Verified.



&#x09;-Tài liệu 3 (hosp-source-03-unreviewed.pdf): Tài liệu nháp về chính sách cho phép thú cưng (pet-friendly policy) chưa được quản lý kiểm duyệt. Trạng thái: Unreviewed (Dùng để kiểm thử việc AI bị chặn không được lấy thông tin từ nguồn chưa duyệt).



### TENANT 2: ẨM THỰC \& CO-WORKING F\&B (F\&B)

* Mã Workspace: tenant-fnb-dn-02



* Lĩnh vực: Chuỗi nhà hàng, quán cà phê kết hợp không gian làm việc cho người nước ngoài tại quận Sơn Trà và Hải Châu, Đà Nẵng.



* Bộ dữ liệu nguồn (Sources chuẩn bị cho UAT):



&#x09;-Tài liệu 1 (fnb-source-01.pdf): Menu tiếng Anh, danh sách đồ uống đặc sản, chính sách ưu đãi khung giờ vàng (Happy Hour) và dịch vụ đặt bàn tổ chức sự kiện workshop. Trạng thái: Verified.



&#x09;-Tài liệu 2 (fnb-source-02.md): Thông tin về tốc độ đường truyền Wi-Fi, chính sách phụ thu ngồi làm việc lâu dài và các món ăn chay/thuần chay (vegan) phục vụ khách quốc tế. Trạng thái: Verified.



## KỊCH BẢN KIỂM THỬ TÍNH NÔ LẬP WORKSPACE (TENANT ISOLATION UAT)

##### 1.Kiểm tra chéo dữ liệu (Cross-tenant Leakage Test)



* Hành động: Đăng nhập vào workspace của Tenant 1 (Lưu trú), yêu cầu AI tìm kiếm thông tin về menu quán cà phê của Tenant 2.



* Kết quả mong đợi: AI phải trả về kết quả "Không tìm thấy thông tin trong cơ sở dữ liệu của Workspace này" hoặc từ chối cung cấp, đảm bảo không có hiện tượng rò rỉ dữ liệu giữa 2 tenant.



##### 2.Kiểm tra nguồn chưa duyệt (Unreviewed Source Block Test)



* Hành động: Truy vấn thông tin về chính sách thú cưng dựa trên tài liệu hosp-source-03-unreviewed.pdf ở Tenant 1.



* Kết quả mong đợi: AI từ chối trả lời vì nguồn dữ liệu đang ở trạng thái Unreviewed chưa được duyệt (Verified).

