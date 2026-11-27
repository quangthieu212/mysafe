# Thiết kế kỹ thuật chi tiết (Technical Design)

Phiên bản 1.0 — 28/10/2026 \| Trạng thái: Bản thiết kế triển khai, CHƯA kiểm toán bảo mật

Phạm vi: Web (Next.js/PWA) + Android/iPhone (React Native); đồng bộ dữ liệu mã hóa đầu cuối; giao diện hoàn toàn bằng tiếng Việt.

# 1. Mục tiêu, phạm vi và quyết định kỹ thuật

Ứng dụng quản lý mật khẩu, tài khoản ngân hàng (chỉ thông tin nhận diện), giấy tờ, ghi chú và tệp đính kèm. Dữ liệu nhạy cảm chỉ được giải mã trên thiết bị đã được cấp quyền. Không cam kết “không thể bị lộ”; đặt mục tiêu giảm rủi ro bằng thiết kế, kiểm thử và vận hành.

| Hạng mục       | Lựa chọn khuyến nghị                         | Lý do                                         |
|----------------|----------------------------------------------|-----------------------------------------------|
| Web            | Next.js + TypeScript + PWA                   | Chia sẻ UI logic, hỗ trợ offline có kiểm soát |
| Mobile         | React Native + TypeScript                    | iOS/Android cùng codebase                     |
| API            | NestJS + TypeScript                          | DTO validation, module hóa, OpenAPI           |
| Database       | PostgreSQL 16+                               | Transaction, version CAS, audit               |
| Object storage | S3-compatible, chỉ ciphertext                | Đính kèm lớn, lifecycle                       |
| Crypto         | Argon2id + HKDF-SHA256 + AES-256-GCM         | Mã hóa client, AEAD                           |
| Session        | OIDC-style flows hoặc PAKE đã được thẩm định | Không tự chế giao thức xác thực               |
| Queue          | Redis-backed worker                          | Email, dọn dữ liệu; không xử lý plaintext     |

## 1.1. Ngoài phạm vi bản đầu

Không hỗ trợ tự động điền trên mọi ứng dụng, chia sẻ két sắt nhóm, đồng bộ ngoại tuyến đa chủ có CRDT, lưu PIN giao dịch/OTP/CVV, hoặc recovery không cần bí mật dự phòng. Tích hợp autofill cần giai đoạn riêng và đánh giá quyền nền tảng.

# 2. Sơ đồ kiến trúc và ranh giới tin cậy

Sơ đồ nguồn: diagrams/architecture.mmd. Client chịu trách nhiệm tạo khóa, giải mã và mã hóa. Backend xác thực, phân quyền, lưu ciphertext và đồng bộ revision; database và object storage được giả định có thể bị đọc trộm. TLS 1.3, bảo vệ CSRF web, CSP nghiêm ngặt, chống XSS và chống dependency supply-chain là yêu cầu bắt buộc.

Ranh giới: \[Web/Mobile + Crypto SDK + khóa trong RAM/secure storage\] → HTTPS → \[API Auth/Sync/Attachments\] → \[PostgreSQL + Object Storage\]. Không gửi plaintext, mật khẩu chính, từ khóa tìm kiếm, khóa gốc lên API.

## 2.1. Quy tắc lưu trữ khóa

Khóa gốc được tạo bằng CSPRNG trên client; chỉ lưu dưới dạng wrappedRootKey được bảo vệ bằng KEK dẫn xuất từ mật khẩu chính. Web không lưu plaintext key trong localStorage/IndexedDB; mobile chỉ lưu wrapped key hoặc key unlock ngắn hạn trong Keychain/Android Keystore tùy chính sách. Khóa giải mã trong RAM phải được xóa khi khóa ứng dụng ở mức thư viện cho phép; JS không bảo đảm zeroization tuyệt đối.

# 3. Mô hình dữ liệu và ERD

ERD: diagrams/erd.mmd; DDL: database/schema.sql. Toàn bộ tiêu đề, tên mục, trường dữ liệu, metadata tệp có thể nhận diện phải nằm trong ciphertext. Server chỉ biết id, owner, kích thước, thời điểm, revision, loại sự kiện vận hành; đây vẫn là metadata nhạy cảm cần giảm thiểu.

| Bảng             | Vai trò                                            | Điểm lưu ý                            |
|------------------|----------------------------------------------------|---------------------------------------|
| users            | Tài khoản, verifier, tham số KDF, wrapped root key | Không lưu master password             |
| devices          | Thiết bị đã đăng ký, public key, trạng thái        | Cần phê duyệt thiết bị mới            |
| vaults           | Két sắt theo người dùng                            | Encrypted name                        |
| vault_items      | Envelope bản mã và revision                        | Soft-delete + AAD                     |
| item_revisions   | Lịch sử ciphertext                                 | Retention có giới hạn                 |
| attachments      | Metadata mã hóa và object key                      | Giới hạn kích thước / quota           |
| device_key_wraps | Key envelope theo thiết bị                         | Thu hồi và rekey có kế hoạch          |
| sessions         | Refresh hash, expiry, revoked                      | Rotation và reuse detection           |
| recovery_kits    | Bản khóa gốc được bọc bởi recovery key             | Recovery secret không nằm trên server |
| audit_events     | Sự kiện đăng nhập/thu hồi                          | Không ghi plaintext / secret          |

# 4. Đặc tả mã hóa đầu cuối

## 4.1. Tạo tài khoản

Client sinh rootKey 256-bit bằng CSPRNG và salt riêng. Dẫn xuất KEK từ master password bằng Argon2id (tham số được benchmark theo thiết bị và version hóa; tham khảo OWASP, không hardcode một cấu hình cho mọi nền tảng). Dùng HKDF-SHA256 với domain separation để tạo các subkey. Bọc rootKey bằng AES-256-GCM với nonce ngẫu nhiên duy nhất, AAD chứa userId, keyVersion và mục đích. Server chỉ nhận ciphertext, KDF params và dữ liệu xác thực theo giao thức được kiểm toán.

## 4.2. Mã hóa mục và đính kèm

Mỗi mục có itemKey 256-bit độc lập, bọc bằng vaultKey/root-derived key; payload JSON phiên bản hóa được mã hóa AES-256-GCM với nonce 96-bit ngẫu nhiên mới cho mỗi lần ghi, AAD ràng buộc userId/vaultId/itemId/schemaVersion/revision/keyVersion. Không dùng lại (key, nonce). File lớn mã hóa theo chunk với nonce/sequence và manifest đã xác thực; kiểm tra toàn vẹn toàn bộ trước khi hiển thị.

## 4.3. Đăng nhập, recovery và thiết bị mới

Không dùng trực tiếp hash/KEK của master password làm “auth verifier” có thể bị replay. Giao thức đăng nhập phải dùng PAKE/OPAQUE triển khai từ thư viện đã được thẩm định hoặc một phương án tách biệt được security review phê duyệt. OpenAPI kèm theo mô tả các endpoint logic; trường proof là placeholder, KHÔNG phải thiết kế wire protocol cuối cùng. Recovery kit tạo recovery key độc lập, mã hóa rootKey và yêu cầu người dùng cất ngoại tuyến. Mất cả mật khẩu chính lẫn recovery key thì không thể giải mã dữ liệu.

## 4.4. Thay đổi mật khẩu / thu hồi thiết bị

Đổi mật khẩu: rewrap rootKey bằng KEK mới và cập nhật atomically; đổi mật khẩu không tự động thu hồi thiết bị đã bị chiếm quyền. Thu hồi thiết bị: revoke token ngay, chặn sync, đánh giá xoay vault/item keys và re-encrypt khi có nghi ngờ compromise. Không thể “thu hồi” dữ liệu plaintext đã được thiết bị tải trước đó.

# 5. Đồng bộ, offline và xử lý xung đột

Nguồn: diagrams/sync-conflict.mmd. API sử dụng revision số nguyên tăng đơn điệu, compare-and-swap trong transaction và idempotency key. GET /sync/changes?cursor=… trả bản mã đã thay đổi và tombstone. Client có hàng đợi thay đổi mã hóa offline. Nếu 409, tải ciphertext mới, giải mã tại client và cho người dùng chọn phiên bản; không ghi đè im lặng. Cursor có expiry và hỗ trợ full resync. Dữ liệu cũ được giữ có giới hạn theo retention policy.

# 6. API và chuẩn lỗi

Hợp đồng: api/openapi.yaml (OpenAPI 3.0.3), import được vào Swagger Editor/UI. Các nhóm endpoint: auth, vaults, items, sync, devices, recovery, attachments. Tất cả endpoint ngoài register/login yêu cầu bearer token; web ưu tiên cookie refresh HttpOnly/Secure/SameSite và access token ngắn hạn trong memory. Thiết lập CSRF protection khi dùng cookie. Đối với API ghi cần Idempotency-Key và If-Match/expectedRevision.

| HTTP           | Đường dẫn                        | Mục đích                     |
|----------------|----------------------------------|------------------------------|
| POST           | /auth/register, /auth/login      | Đăng ký, xác thực            |
| POST           | /auth/refresh, /auth/logout      | Quay vòng / thu hồi session  |
| GET            | /vaults                          | Liệt kê két sắt              |
| GET/POST       | /vaults/{vaultId}/items          | Danh sách / thêm mục mã hóa  |
| GET/PUT/DELETE | /vaults/{vaultId}/items/{itemId} | Chi tiết / CAS / xóa mềm     |
| GET            | /sync/changes                    | Đồng bộ theo cursor          |
| GET            | /devices                         | Thiết bị đã đăng ký          |
| POST           | /devices/{deviceId}/revoke       | Thu hồi thiết bị             |
| GET            | /recovery/status                 | Trạng thái recovery          |
| POST           | /attachments/\*-intent           | Presigned URL cho ciphertext |

Quy tắc lỗi: 400 dữ liệu không hợp lệ, 401 chưa xác thực, 403 không sở hữu, 404 không tồn tại, 409 revision conflict, 413 tệp quá lớn, 429 quá giới hạn. Mỗi lỗi trả code, message tiếng Việt, requestId; không trả thông tin nhạy cảm. API draft còn cần bổ sung schemas cho một số endpoint trước khi code generation.

# 7. Đặc tả giao diện từng màn hình

Danh sách đầy đủ: ui/screen-inventory.csv; wireframe responsive: ui/wireframes.html. Tất cả copy, lỗi, thông báo và trợ giúp mặc định tiếng Việt. Tránh đưa bí mật vào URL, notification, analytics, crash report và screenshot app switcher.

## S01 — Chào mừng

Thành phần / hành vi: Tạo két sắt / Đăng nhập / Tìm hiểu bảo mật.

Yêu cầu bảo mật / nghiệm thu: Không tự động gửi telemetry; cảnh báo dữ liệu thử nghiệm.

## S02 — Đăng ký

Thành phần / hành vi: Email, mật khẩu chính, xác nhận, tạo recovery kit.

Yêu cầu bảo mật / nghiệm thu: Hiển thị độ mạnh; không gửi mật khẩu chính; bắt buộc xác nhận lưu recovery kit.

## S03 — Đăng nhập

Thành phần / hành vi: Email, mật khẩu chính, chọn thiết bị.

Yêu cầu bảo mật / nghiệm thu: Chống brute-force; không tiết lộ email tồn tại.

## S04 — Trang chủ

Thành phần / hành vi: Tìm kiếm, danh mục, mục gần đây, trạng thái đồng bộ.

Yêu cầu bảo mật / nghiệm thu: Danh sách giải mã cục bộ; ẩn nội dung nhạy cảm trong thông báo.

## S05 — Danh sách mục

Thành phần / hành vi: Lọc danh mục, sắp xếp, thêm mục.

Yêu cầu bảo mật / nghiệm thu: Tìm kiếm cục bộ; không gửi từ khóa lên server.

## S06 — Chi tiết mục

Thành phần / hành vi: Tên, trường tùy chỉnh, sao chép, sửa, xóa.

Yêu cầu bảo mật / nghiệm thu: Ẩn mật khẩu; xóa clipboard theo chính sách nền tảng.

## S07 — Thêm/sửa mục

Thành phần / hành vi: Loại mục, nhãn, username, mật khẩu, URL, ghi chú.

Yêu cầu bảo mật / nghiệm thu: Validation; encrypt trước network; cảnh báo mất thay đổi.

## S08 — Tạo mật khẩu

Thành phần / hành vi: Độ dài, ký tự, mật khẩu tạo ra.

Yêu cầu bảo mật / nghiệm thu: Dùng CSPRNG; không log và không tự gửi.

## S09 — Giấy tờ

Thành phần / hành vi: Loại giấy tờ, thông tin, file đính kèm.

Yêu cầu bảo mật / nghiệm thu: Mã hóa tệp tại client; giới hạn dung lượng.

## S10 — Thiết bị

Thành phần / hành vi: Danh sách, phê duyệt, thu hồi thiết bị.

Yêu cầu bảo mật / nghiệm thu: Thiết bị mới cần xác minh; thu hồi token và xoay khóa theo threat model.

## S11 — Sao lưu/khôi phục

Thành phần / hành vi: Xuất encrypted backup, nhập, kiểm tra mật khẩu.

Yêu cầu bảo mật / nghiệm thu: Không xuất plaintext mặc định; kiểm tra integrity.

## S12 — Bảo mật

Thành phần / hành vi: Tự khóa, sinh trắc học, phiên đăng nhập, recovery.

Yêu cầu bảo mật / nghiệm thu: Biometric unlock chỉ dùng khóa cục bộ trong Keystore/Keychain.

## S13 — Xung đột đồng bộ

Thành phần / hành vi: So sánh bản sửa cục bộ, bản từ server.

Yêu cầu bảo mật / nghiệm thu: Không tự gộp trường nhạy cảm; giữ bản sao an toàn.

## S14 — Cài đặt

Thành phần / hành vi: Ngôn ngữ, chủ đề, quản lý tài khoản, xóa tài khoản.

Yêu cầu bảo mật / nghiệm thu: Xác nhận thao tác phá hủy; quy trình xóa dữ liệu và bản sao lưu.

# 8. Yêu cầu phi chức năng và threat model

| Mối đe dọa              | Biện pháp                                                 | Kiểm thử                      |
|-------------------------|-----------------------------------------------------------|-------------------------------|
| DB/storage bị lộ        | AEAD client, key không ở server                           | Dump DB không giải mã được    |
| XSS web                 | CSP, Trusted Types, dependency pin, no secret persistence | Pentest XSS                   |
| Thiết bị bị đánh cắp    | Auto-lock, biometrics local, revoke                       | Kiểm thử khóa/thu hồi         |
| Brute-force login       | PAKE, rate limit, anomaly detection                       | Thử giới hạn login            |
| Mất máy / quên mật khẩu | Recovery kit + encrypted backup                           | Diễn tập restore thiết bị mới |
| Replay / conflict       | Nonce unique, revision CAS, idempotency                   | Race tests                    |
| Tấn công chuỗi cung ứng | SBOM, SCA, ký release                                     | CI dependency scan            |

Hiệu năng mục tiêu ban đầu: p95 API đọc ciphertext \< 400ms trong điều kiện test chuẩn; offline đọc mục đã cache \< 1s trên thiết bị mục tiêu; uptime mục tiêu 99.9% sau khi vận hành ổn định. Đây là mục tiêu đề xuất, không phải kết quả đo.

# 9. Triển khai, CI/CD và vận hành

Monorepo: apps/web, apps/mobile, services/api, packages/crypto, packages/contracts, infra/, docs/. CI: lint, typecheck, unit, integration, migration check, OpenAPI lint, SAST/SCA, build ký số, SBOM. Secrets trong secret manager; backup DB/object có mã hóa ở tầng hạ tầng; restore drill hàng quý; tách dev/staging/prod; audit log tối thiểu và chính sách lưu giữ.

# 10. Test cases và tiêu chí nghiệm thu

| ID   | Tình huống                                                | Kết quả mong đợi                                                |
|------|-----------------------------------------------------------|-----------------------------------------------------------------|
| TC01 | Đăng ký/đăng nhập, mở khóa offline sau khi đã tải dữ liệu | Không gửi master password; khóa tự động                         |
| TC02 | Tạo/sửa/xóa mục trên web và mobile                        | Cả hai đồng bộ ciphertext; revision đúng                        |
| TC03 | Hai thiết bị sửa cùng một mục                             | 409 và UI giải quyết xung đột; không mất dữ liệu                |
| TC04 | Mất điện thoại, đăng nhập thiết bị mới                    | Khôi phục bằng secret hợp lệ, không cần máy cũ nếu recovery kit |
| TC05 | Mất master và recovery                                    | Không có đường backdoor giải mã                                 |
| TC06 | DB dump và object dump                                    | Không xuất hiện plaintext nhạy cảm                              |
| TC07 | Sao lưu và khôi phục                                      | Import backup mã hóa; kiểm tra AEAD integrity                   |
| TC08 | Thu hồi thiết bị                                          | Token bị chặn; không hứa xóa dữ liệu đã tải                     |
| TC09 | Mất mạng / mạng chập chờn                                 | Queue retry idempotent; không tạo bản ghi trùng                 |
| TC10 | Kiểm thử web/mobile                                       | OWASP ASVS/MASVS, pentest độc lập trước production              |

# 11. Kế hoạch triển khai và điểm chốt (gates)

| Sprint       | Đầu ra                                        | Điều kiện hoàn tất                         |
|--------------|-----------------------------------------------|--------------------------------------------|
| 0 (2 tuần)   | Threat model, protocol decision, UX review    | Security sign-off trước viết crypto        |
| 1–2 (4 tuần) | Crypto SDK + test vectors + API auth skeleton | Review crypto độc lập, test cross-platform |
| 3–4 (4 tuần) | CRUD web + sync + migration                   | E2E web, CAS conflict                      |
| 5–6 (4 tuần) | Mobile + secure storage + recovery            | E2E iOS/Android                            |
| 7 (2 tuần)   | Backup, attachment, device revoke             | Restore drill, negative tests              |
| 8–9 (4 tuần) | Hardening, pentest, beta                      | Không có lỗ hổng nghiêm trọng chưa xử lý   |

# 12. Các quyết định bắt buộc trước khi code production

- Chốt PAKE/OPAQUE library và thiết kế verifier; không triển khai trường proof mẫu như giao thức thật.

- Chốt thiết kế key hierarchy, envelope format, nonce allocation, AAD và test vectors đa nền tảng.

- Chốt recovery UX và khả năng mất dữ liệu khi không có recovery key.

- Chốt chính sách lưu trữ local web, chống XSS, mobile keychain/keystore, offline cache.

- Chốt quota, retention, delete account, dữ liệu metadata và quyền riêng tư.

- Chốt mức độ audit độc lập, mục tiêu ASVS/MASVS và kế hoạch ứng phó sự cố.

Ghi chú: Tài liệu này đủ để chia việc và khởi động prototype kỹ thuật, nhưng không thay thế security review, OpenAPI hoàn thiện hay threat-model sign-off trước phát hành lưu dữ liệu thật.
