# Két Sắt Việt — Bộ tài liệu Markdown (UTF-8)

Bộ tài liệu được chuyển từ kế hoạch, đặc tả hệ thống và bộ Technical Design đã tạo trước đó. Tất cả tài liệu trong gói này ở định dạng `.md`, mã hóa ký tự **UTF-8** (không phải mã hóa bảo mật).

## Cấu trúc

- `ke-hoach/Ke_hoach_va_Dac_ta_He_thong_Ket_Sat_Viet.md`: kế hoạch và yêu cầu hệ thống.
- `ky-thuat/Technical_Design_Ket_Sat_Viet.md`: thiết kế kỹ thuật.
- `ky-thuat/diagrams/*.mmd.md`: sơ đồ Mermaid hiển thị trong Markdown.
- `ky-thuat/api/openapi.yaml.md`: OpenAPI được bọc trong khối mã YAML.
- `ky-thuat/database/schema.sql.md`: SQL được bọc trong khối mã.
- `ky-thuat/ui/screen-inventory.csv.md`: đặc tả màn hình dạng bảng Markdown.
- `ky-thuat/ui/wireframes.html.md`: mã HTML của bản mẫu được bọc trong khối mã.

## Cách dùng

Mở bằng VS Code hoặc ứng dụng hỗ trợ Markdown; chọn **UTF-8** nếu có lỗi dấu tiếng Việt. Với sơ đồ Mermaid, dùng Markdown Preview có hỗ trợ Mermaid. Các file API, SQL, HTML được trình bày như tài liệu, **không chạy trực tiếp dưới đuôi `.md`**; nếu cần sử dụng trong Swagger, PostgreSQL hoặc trình duyệt, hãy lấy nội dung khối mã và lưu lại bằng phần mở rộng gốc.

## Lưu ý bảo mật

Đây là bản thiết kế chưa kiểm toán bảo mật. Giao thức xác thực mẫu, quản lý khóa và quy trình khôi phục phải được rà soát trước khi sử dụng dữ liệu thật.
