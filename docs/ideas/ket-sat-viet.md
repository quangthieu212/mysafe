# Két Sắt Việt — Định hướng MVP

Ngày chốt: 28/10/2026. Trạng thái: Định hướng sản phẩm đã thống nhất; chưa phải đặc tả triển khai hoặc xác nhận an toàn bảo mật.

## Bài toán

Làm sao để người Việt lưu và tìm lại thông tin cá nhân dễ dàng trên nhiều thiết bị, đồng thời lấy lại được dữ liệu khi mất máy hoặc thao tác nhầm?

## Hướng đề xuất

Một két cá nhân bằng tiếng Việt, cho phép người dùng tự định nghĩa thông tin cần lưu dưới dạng chữ và trường tùy chỉnh. Chủ dự án phát triển một mình và là người sử dụng đầu tiên; sản phẩm mở miễn phí cho mọi người dùng thử. Tầm nhìn phục vụ mọi người Việt, bắt đầu kiểm chứng với chủ dự án và một nhóm nhỏ.

Trải nghiệm tập trung vào ba việc: **cất nhanh — tìm dễ — khôi phục được**. Đồng bộ, sao lưu và khôi phục là yêu cầu bắt buộc ngay trong bản đầu. Đồng bộ không thay thế sao lưu vì thao tác xóa hoặc sửa nhầm có thể lan truyền giữa các thiết bị.

Giá trị cần kiểm chứng là người dùng có tự thực hiện được các việc này và muốn dùng tiếp hay không. Tiếng Việt và miễn phí chưa đủ để chứng minh giá trị.

Nền tảng bản đầu đã chốt: **web responsive dùng trên điện thoại và máy tính**, đồng bộ giữa các trình duyệt/thiết bị đã được cấp quyền. Chưa xây ứng dụng Android/iOS riêng. Khả năng cài đặt dạng PWA là lựa chọn triển khai cần đánh giá, không phải yêu cầu đã chốt.

## Giả định cần xác thực

- [ ] Dữ liệu dạng chữ đủ hữu ích: chủ dự án và nhóm nhỏ sử dụng với nhu cầu hằng ngày, ghi nhận nội dung chưa lưu được.
- [ ] Người dùng hiểu cách giữ và dùng mã khôi phục: thử khôi phục trên thiết bị mới mà không cần hướng dẫn trực tiếp.
- [ ] Đồng bộ không làm mất thay đổi: thử sửa đồng thời, mất mạng, kết nối lại và xóa nhầm.
- [ ] Một người có thể duy trì dịch vụ miễn phí: đo chi phí theo lượng dữ liệu, lịch sử và sao lưu; đặt hạn mức trước khi mở rộng.

Rủi ro quyết định là mất dữ liệu, không khôi phục được hoặc chi phí vượt khả năng duy trì. Thiết kế bảo mật hiện có cần hoàn thiện và đánh giá độc lập trước khi tiếp nhận dữ liệu nhạy cảm thật.

## Phạm vi MVP

- Tạo mục với tiêu đề, ghi chú và trường tùy chỉnh; hỗ trợ trường thường và trường bí mật.
- Giao diện web responsive, thao tác được bằng cảm ứng trên điện thoại và chuột/bàn phím trên máy tính.
- Có mẫu đơn giản cho tài khoản, thông tin giấy tờ và ghi chú; cho phép tạo mục tự do.
- Tìm kiếm cục bộ, sao chép thông tin và tự khóa.
- Mã hóa nội dung trên thiết bị trước khi gửi lên máy chủ.
- Đồng bộ nhiều thiết bị; hiển thị trạng thái đang chờ, thành công hoặc lỗi.
- Đọc dữ liệu đã có khi mất mạng; giữ các bản sửa khi xảy ra xung đột, không ghi đè âm thầm.
- Sao lưu mã hóa tự động có lịch sử giới hạn; xuất bản sao lưu độc lập để người dùng tự giữ.
- Khôi phục trên thiết bị mới bằng bí mật khôi phục; phục hồi mục xóa nhầm hoặc phiên bản trước trong thời hạn lưu giữ.

Tiêu chí thành công cốt lõi: lưu trên máy A, mở được trên máy B; mất máy A vẫn khôi phục được bằng bí mật hợp lệ; xóa nhầm vẫn lấy lại được trong thời hạn lưu giữ. Cần kiểm thử cả tình huống dữ liệu đang đồng bộ bị xóa hoặc hỏng.

## Chưa làm và lý do

- Ảnh, PDF, video — giảm dung lượng và độ phức tạp; bản đầu chỉ lưu chữ và trường tùy chỉnh.
- Ứng dụng Android/iOS riêng — tập trung hoàn thiện và kiểm chứng bản web trước.
- Chia sẻ két, nhóm và gia đình — tránh mở rộng phân quyền.
- Autofill — dành cho giai đoạn chuyên sâu về quản lý mật khẩu.
- AI đọc hoặc phân loại nội dung — chưa cần để kiểm chứng nhu cầu chính.
- Cam kết miễn phí không giới hạn — cần biết chi phí vận hành thực tế.

## Điểm còn phải chốt

- Danh sách trình duyệt/thiết bị mục tiêu, chính sách cache mã hóa trên web và phạm vi PWA nếu triển khai.
- Ngân sách vận hành và hạn mức dữ liệu cho giai đoạn dùng thử miễn phí.
- Tần suất sao lưu, thời hạn giữ bản sao, lịch sử phiên bản và thùng rác.
- Mục tiêu thời gian khôi phục và mức dữ liệu có thể mất giữa hai lần sao lưu.
- Thiết kế xác thực, quản lý khóa và quy trình khôi phục cụ thể; giải thích rõ khi tạo két rằng mất cả phương thức mở khóa lẫn bí mật khôi phục có thể khiến dữ liệu không thể giải mã.
- Phạm vi đánh giá bảo mật độc lập trước khi mở cho dữ liệu nhạy cảm thật.

## Cơ sở

- Đã đọc bộ Markdown tại `Ket_Sat_Viet_Toan_Bo_Tai_Lieu_MD`, gồm kế hoạch, thiết kế kỹ thuật, API, SQL, bốn sơ đồ, danh sách màn hình và mã wireframe. Bản Markdown của kế hoạch đã cung cấp phần nội dung trước đây không đọc được từ DOCX.
- Xem [đối chiếu tài liệu và bước tiếp theo](../planning/doi-chieu-mvp-va-tai-lieu.md). Phạm vi người dùng đã chốt trong cuộc trao đổi được ưu tiên khi tài liệu tham khảo mô tả phạm vi rộng hơn.

- Nguồn tham khảo kỹ thuật do chủ dự án cung cấp: [Cuộc trao đổi trên ChatGPT](https://chatgpt.com/share/6ae19dd1-4820-83ec-bc87-91bf9c28d8f0). Chưa đối chiếu nội dung vì công cụ truy cập trả lỗi `Cache miss`; chưa sử dụng nguồn này để đưa ra quyết định kỹ thuật.

Định hướng được chốt qua trao đổi với chủ dự án. Đã tham khảo tài liệu thiết kế kỹ thuật, danh sách màn hình và sơ đồ kiến trúc trong `Bo_Tai_Lieu_Ky_Thuat_Ket_Sat_Viet_v1.zip`. Tài liệu rời `Ke_hoach_va_Dac_ta_He_thong_Ket_Sat_Viet.docx` được bảo vệ bằng Fasoo DRM nên chưa đọc được nội dung.
