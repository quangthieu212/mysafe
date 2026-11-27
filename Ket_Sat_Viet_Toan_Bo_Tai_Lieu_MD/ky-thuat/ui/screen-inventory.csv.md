# Danh sách và đặc tả màn hình

| Mã | Màn hình | Thành phần | Yêu cầu bảo mật |
| --- | --- | --- | --- |
| S01 | Chào mừng | Tạo két sắt / Đăng nhập / Tìm hiểu bảo mật | Không tự động gửi telemetry; cảnh báo dữ liệu thử nghiệm |
| S02 | Đăng ký | Email, mật khẩu chính, xác nhận, tạo recovery kit | Hiển thị độ mạnh; không gửi mật khẩu chính; bắt buộc xác nhận lưu recovery kit |
| S03 | Đăng nhập | Email, mật khẩu chính, chọn thiết bị | Chống brute-force; không tiết lộ email tồn tại |
| S04 | Trang chủ | Tìm kiếm, danh mục, mục gần đây, trạng thái đồng bộ | Danh sách giải mã cục bộ; ẩn nội dung nhạy cảm trong thông báo |
| S05 | Danh sách mục | Lọc danh mục, sắp xếp, thêm mục | Tìm kiếm cục bộ; không gửi từ khóa lên server |
| S06 | Chi tiết mục | Tên, trường tùy chỉnh, sao chép, sửa, xóa | Ẩn mật khẩu; xóa clipboard theo chính sách nền tảng |
| S07 | Thêm/sửa mục | Loại mục, nhãn, username, mật khẩu, URL, ghi chú | Validation; encrypt trước network; cảnh báo mất thay đổi |
| S08 | Tạo mật khẩu | Độ dài, ký tự, mật khẩu tạo ra | Dùng CSPRNG; không log và không tự gửi |
| S09 | Giấy tờ | Loại giấy tờ, thông tin, file đính kèm | Mã hóa tệp tại client; giới hạn dung lượng |
| S10 | Thiết bị | Danh sách, phê duyệt, thu hồi thiết bị | Thiết bị mới cần xác minh; thu hồi token và xoay khóa theo threat model |
| S11 | Sao lưu/khôi phục | Xuất encrypted backup, nhập, kiểm tra mật khẩu | Không xuất plaintext mặc định; kiểm tra integrity |
| S12 | Bảo mật | Tự khóa, sinh trắc học, phiên đăng nhập, recovery | Biometric unlock chỉ dùng khóa cục bộ trong Keystore/Keychain |
| S13 | Xung đột đồng bộ | So sánh bản sửa cục bộ, bản từ server | Không tự gộp trường nhạy cảm; giữ bản sao an toàn |
| S14 | Cài đặt | Ngôn ngữ, chủ đề, quản lý tài khoản, xóa tài khoản | Xác nhận thao tác phá hủy; quy trình xóa dữ liệu và bản sao lưu |
