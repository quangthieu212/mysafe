# Đặc tả triển khai web MVP

Phạm vi sản phẩm kế thừa `ideas/ket-sat-viet.md`; chủ dự án đã yêu cầu tiếp tục triển khai ngày 28/10/2026. Bản triển khai đầu là prototype local với dữ liệu thử, không phải bản đã kiểm toán để mở công khai.

## Mục tiêu và tiêu chí

Web responsive bằng tiếng Việt: tạo két, lưu mục văn bản/trường tùy chỉnh, tìm kiếm, tự khóa, đồng bộ, xử lý xung đột, thùng rác, lịch sử, sao lưu và khôi phục. Không có tệp đính kèm, chia sẻ nhóm, autofill hoặc ứng dụng native.

## Bản đồ module và thứ tự

| ID | Trách nhiệm | Phụ thuộc |
| --- | --- | --- |
| vault-model | Kiểm tra cấu trúc mục và giới hạn | — |
| vault-crypto | Envelope, khóa được bọc, xuất/nhập backup | vault-model |
| identity | Tài khoản thử nghiệm và cookie phiên | — |
| vault-sync | Lưu ciphertext, CAS, lịch sử, idempotency | identity |
| vault-web | Giao diện, cache mã hóa và thao tác người dùng | vault-model, vault-crypto, vault-sync |

## Lựa chọn triển khai và giới hạn

- Next.js App Router + React + TypeScript; Route Handlers cùng origin để giảm số dịch vụ local. SQLite Node 24 là adapter thử nghiệm, chưa thay quyết định PostgreSQL cho môi trường công khai.
- Đồng bộ một snapshot toàn két có giới hạn, revision tăng theo két. CAS và operation ID cố định cho một lần lưu/retry. Xung đột giữ bản local và server; người dùng có thể nhập bản local thành các mục riêng. Đây là bước thử nghiệm đơn giản hơn thiết kế sync từng mục; incremental sync từng mục còn trong backlog.
- Snapshot mã hóa AES-GCM qua Web Crypto; Argon2id qua thư viện hash-wasm cho việc bọc root key. Không tự viết thuật toán. Khóa nội dung ngẫu nhiên; master password và recovery secret chỉ xử lý ở client. Envelope phải ràng buộc vault ID và snapshot ID bằng AAD, độc lập revision do server cấp. Tham số KDF được version hóa và giới hạn khi nhập file.
- Prototype dùng mật khẩu đăng nhập riêng (server hash bằng scrypt), tách mật khẩu chính. Không triển khai `authVerifier/proof` placeholder thành PAKE. Phương án này cần review độc lập; email verification, MFA và recovery truy cập tài khoản chưa hoàn tất.
- Recovery code mở khóa dữ liệu hoặc backup, không được mô tả như cách vượt xác thực tài khoản. File backup mở được ở trình duyệt sạch không cần server/account. Quên login password vẫn có giới hạn nếu không có file backup; phải thể hiện rõ.
- Chỉ lưu ciphertext/envelope trên server và browser cache. Khóa đã mở chỉ giữ trong RAM. Cache giữ một trạng thái có version và pending operation; không đưa mật khẩu chính hoặc khóa rõ vào localStorage.
- Mỗi ghi thành công lưu lịch sử ciphertext trong SQLite và cache mã hóa mới nhất trong IndexedDB. SQLite chỉ giữ 20 snapshot mới nhất trên mỗi user; việc dọn snapshot cũ cùng transaction với ghi/restore. Ledger lưu SHA-256 envelope và revision riêng để retry vẫn idempotent sau khi payload lịch sử bị dọn. Ledger này là metadata vận hành và không thay backup offsite. SQLite và cache cùng nằm trong hai môi trường dễ mất; chưa có snapshot tự động độc lập trên offsite.
- Bản prototype có quota hữu hạn: 200 mục, tối đa 30 trường/mục, 200 ký tự tiêu đề/nhãn, 10.000 ký tự giá trị/ghi chú; ciphertext tối đa 2 MiB. Không cam kết SLA hoặc không mất dữ liệu khi chưa sync.

## Hợp đồng API local v1

`/api/account`: POST register/login, GET session+descriptor, DELETE logout; DELETE `{action:"delete",email,loginPassword}` yêu cầu phiên hợp lệ, same-origin, email hiện tại và mật khẩu đăng nhập đúng rồi xóa user cùng dữ liệu liên quan khỏi database ứng dụng. Xóa tài khoản thu hồi tất cả phiên qua cascade; client xóa cache IndexedDB trên thiết bị đang dùng. Đây không phải bảo đảm xóa vật lý an toàn khỏi ổ đĩa/WAL; cache trên thiết bị khác và file backup tải về không thể xóa từ xa. Cookie HttpOnly, SameSite Strict, Secure trong production; thời hạn hữu hạn. Mutations kiểm tra Origin. Login password không phải master password.

`/api/vault`: GET snapshot mới nhất + descriptor; PUT `{operationId, expectedRevision, envelope}`. Trả revision; 409 trả trạng thái conflict để client tải bản hiện hành; retry cùng ID/body trả kết quả cũ; tái dùng ID cho payload khác bị từ chối. Không ghi nội dung rõ.

`/api/history`: GET lịch sử ciphertext của chính user. Restore tạo revision mới, không quay lùi revision. Trả lỗi `{code,message}` có status 400/401/409/413/429/500 phù hợp; không trả stack trace.

## Kiểm thử

- Unit: schema/giới hạn, mã hóa round-trip, sai mật khẩu, recovery, AAD khác, ciphertext/backup hỏng, file lạ và tham số KDF quá mức.
- Integration với SQLite tạm: cách ly hai user, CAS, replay idempotency, lịch sử, file snapshot, auth và origin.
- Playwright trình duyệt độc lập: tạo két, CRUD trường tùy chỉnh, tìm, xóa/restore, lock/unlock, sync hai context, conflict, export/import backup ở context sạch; viewport điện thoại và desktop, không tràn ngang.
- Lệnh: `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.

## Quy tắc

Luôn kiểm tra đầu vào ở API và khi giải mã/import. Không dùng HTML từ nội dung két. Không lưu secret vào log, URL hoặc telemetry. Không tự công bố production-ready, không thay kiểm toán bằng tests. Chỉ tick checklist khi có bằng chứng tương ứng. Mọi tính năng còn thiếu hoặc mới thử local được ghi rõ.

## Nguồn kỹ thuật

- https://nextjs.org/docs/app/getting-started/installation
- https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- https://nodejs.org/api/sqlite.html
- https://github.com/Daninet/hash-wasm
- https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt

Đây là nguồn API sử dụng, không phải chứng nhận bảo mật của ứng dụng hoặc thư viện.
