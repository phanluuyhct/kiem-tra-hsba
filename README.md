# Kiểm tra hồ sơ bệnh án – Phòng KHTH, Bệnh viện 30-4

Web app giúp tổ bệnh án P.KHTH:
- nhập danh sách người bệnh ra viện từ HIS (file PDF/Excel báo cáo KHTH08.1),
- ghi nhận kết quả giao hồ sơ và đánh giá chất lượng, chọn lỗi theo danh mục,
- xem Dashboard theo khoa, theo tháng/quý/năm và xuất Excel.

Địa chỉ: https://hsba.bv304.org

## Cấu trúc
- `index.html` – giao diện, bộ đọc file PDF của HIS.
- `app.js` – logic, kết nối Supabase (dự án khth-bv304, bảng `hsba_ho_so`, `hsba_loi`, `hsba_can_bo`).
- `CNAME` – tên miền riêng cho GitHub Pages.

Đăng nhập bằng tài khoản app Công việc KHTH. Quyền dùng: Trưởng/Phó trưởng phòng, quản trị, và cán bộ được cấp ở tab “Cán bộ”.
Khóa trong `app.js` là khóa công khai (publishable) của Supabase; dữ liệu được bảo vệ bằng Row Level Security.
