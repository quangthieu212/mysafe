# Két Sắt Việt · Web prototype

Prototype local bằng tiếng Việt cho web responsive trên điện thoại và máy tính. Hiện có tạo tài khoản thử nghiệm, tạo/mở khóa két, lưu nội dung chữ và trường tùy chỉnh mã hóa tại trình duyệt, đồng bộ snapshot có revision, sao lưu file mã hóa và khôi phục.

## Chạy local

- Cần Node.js 24.15.x và npm 12. Registry npm được đặt HTTPS trong `.npmrc`.
- Chạy `npm install`, sau đó `npm run dev`.
- Mở `http://127.0.0.1:3000`.
- Cơ sở dữ liệu thử nghiệm nằm trong `data/ket-sat-viet.sqlite`; đặt `KSV_DATA_DIR` để đổi thư mục.
- Chạy `npm run typecheck` và `npm run build` để kiểm tra type và build.
- Chạy `npm test` cho 6 unit tests; `npm run test:integration` build và chạy 6 HTTP integration tests cho auth, cách ly tài khoản, sync, restore, xóa tài khoản, retention và giới hạn request. Integration tests tự mở server local trên port tự cấp, dùng SQLite trong thư mục tạm và dọn sau khi chạy; không dùng dữ liệu trong `data/`.
- `npm run check` chạy toàn bộ typecheck, unit tests, build và integration tests. Kiểm thử giao diện bằng browser/E2E vẫn chưa hoàn tất.
- Chạy `npm run test:e2e` để build và chạy Playwright với Chrome trên luồng tài khoản, mở khóa, cold start offline, sync qua hai browser context, backup export/import và responsive 320/768/1024/1440 px; test server dùng SQLite riêng trong `.test-data/e2e`.

## Chỉ dùng dữ liệu giả

Prototype này **chưa được kiểm toán bảo mật** và chỉ nên chạy local. Mật khẩu đăng nhập gửi tới Route Handler để băm scrypt và cookie phiên; chưa có email verification/MFA/PAKE, rate limit chỉ local, CORS/HTTPS/triển khai chưa cấu hình. Không mở port ra LAN hay Internet.

Nội dung két được mã hóa trong trình duyệt bằng Web Crypto AES-GCM; root key được bọc với Argon2id từ `hash-wasm`. Mật khẩu chính không gửi lên API. Đây là implementation thử nghiệm, chưa phải thiết kế crypto được reviewer phê duyệt. Dữ liệu trong IndexedDB và SQLite đều là ciphertext/envelope nhưng metadata vận hành vẫn có thể lộ.

Khi ứng dụng production đã được tải và thiết bị đã có cache IndexedDB, service worker giữ app shell cùng tài nguyên `/_next/static/` để mở lại khi offline. Màn hình khóa dùng descriptor và snapshot mã hóa trên thiết bị; chỉ mật khẩu chính hoặc recovery code đúng mới giải mã. Thay đổi offline được lưu mã hóa và tự gửi lại khi mạng trở lại. Service worker không cache `/api/*`; bản offline có thể cũ, không thể xác thực tài khoản hoặc kiểm tra thay đổi từ máy chủ cho đến khi kết nối lại. Cache trình duyệt có thể bị xóa bởi người dùng/trình duyệt và không thay thế file sao lưu.

File sao lưu do người dùng tải về có thể mở được bằng master password hoặc recovery code khi đã có ứng dụng tương thích. Snapshot lịch sử tự động hiện chỉ lưu trong cùng SQLite trên cùng máy; **không phải offsite backup**. Mất máy chủ hoặc thư mục `data/` làm mất lịch sử server. File xuất độc lập là bản sao cần người dùng cất riêng.

Máy chủ giữ tối đa 20 snapshot mới nhất cho mỗi két. Hash thao tác được giữ riêng để retry vẫn idempotent sau khi snapshot cũ bị dọn. Đây là giới hạn lịch sử, không phải offsite backup hay chính sách xóa dữ liệu tài khoản.

API đọc request JSON theo stream với trần 2 MiB + 16 KiB cho snapshot/restore và 16 KiB cho auth; xóa tài khoản có trần 2 KiB. Giới hạn được áp dụng kể cả khi request không gửi `Content-Length`. Đây là trần payload/request, chưa phải quota tổng dung lượng database cho mỗi tài khoản.

Thùng rác prototype được mã hóa trong snapshot đồng bộ; purge tombstone còn cần chính sách rõ trước public beta. Xóa tài khoản cần email và mật khẩu đăng nhập, xóa bản ghi khỏi database ứng dụng và cache trên thiết bị hiện tại; đây không phải cam kết xóa vật lý an toàn khỏi ổ đĩa/WAL. Cache ở thiết bị khác và file backup đã tải xuống không thể bị xóa từ xa. Logout thu hồi phiên hiện tại nhưng bản cache mã hóa vẫn còn trên thiết bị. Khôi phục bằng recovery code chỉ mở dữ liệu sau khi đăng nhập, chưa phục hồi tài khoản/mất MFA.

Trước khi dùng dữ liệu thật hoặc public beta cần hoàn tất checklist trong `tasks/todo.md`, đặc biệt review auth/crypto, rate limiting phân tán, PostgreSQL, xóa dữ liệu/tombstone, retention/offsite backup và pentest.
