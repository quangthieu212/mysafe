KẾ HOẠCH TRIỂN KHAI & ĐẶC TẢ HỆ THỐNG (PRD + SRS + KIẾN TRÚC)

Phiên bản tài liệu: 1.0 \| Ngày: 28/10/2026 \| Trạng thái: Dự thảo để phê duyệt

Sản phẩm: Web + Android + iPhone; đồng bộ dữ liệu mã hóa đầu cuối; giao diện hoàn toàn bằng tiếng Việt.

# 1. Tóm tắt điều hành

Xây dựng két sắt số cá nhân lưu thông tin đăng nhập, tài khoản ngân hàng (không lưu thông tin xác thực giao dịch nhạy cảm), giấy tờ, ghi chú và tệp đính kèm. Dữ liệu được mã hóa tại thiết bị trước khi đồng bộ. Máy chủ chỉ xử lý bản mã và siêu dữ liệu tối thiểu. Mục tiêu: dễ dùng, có khả năng khôi phục khi mất thiết bị, bảo vệ riêng tư và có cơ chế kiểm chứng an toàn.

Lưu ý: zero-knowledge là mục tiêu kiến trúc, không phải bảo đảm tuyệt đối; cần kiểm thử độc lập, rà soát mật mã và kiểm soát rò rỉ siêu dữ liệu trước khi lưu dữ liệu thật.

# 2. Mục tiêu, KPI và phạm vi

| Mục tiêu            | Tiêu chí chấp nhận                                                                    |
|---------------------|---------------------------------------------------------------------------------------|
| Tiếng Việt toàn bộ  | 100% màn hình, thông báo, trợ giúp, lỗi và quy trình khôi phục tiếng Việt             |
| Đồng bộ đa thiết bị | Thêm mục trên Web, thấy bản mã đồng bộ và giải mã được trên Android/iOS sau đăng nhập |
| Bảo vệ dữ liệu      | Không gửi plaintext, mật khẩu chính, khóa giải mã lên API; mã hóa tại client          |
| Khôi phục thiết bị  | Thiết bị mới đăng nhập + phương thức xác thực + mật khẩu chính để giải mã             |
| Tính sẵn sàng       | Mục đã tải có thể xem ngoại tuyến sau khi mở khóa; đồng bộ lại khi có mạng            |
| An toàn phát hành   | Không có lỗ hổng mức Critical/High chưa xử lý; pentest và đánh giá crypto độc lập     |

# 2.1. MVP (bản thương mại thử nghiệm)

- Đăng ký, xác minh email, đăng nhập, quản lý phiên và thiết bị.

- Tạo/mở khóa két sắt, thêm/sửa/xóa/tìm kiếm mục; bộ sinh mật khẩu.

- Danh mục: Website/App, Ngân hàng (thông tin định danh), Ví, Giấy tờ, Ghi chú.

- Đồng bộ bản mã nhiều thiết bị, xử lý xung đột và chế độ ngoại tuyến.

- Xuất/nhập bản sao lưu mã hóa; quy trình khôi phục và cảnh báo mất mật khẩu chính.

- Sinh trắc học chỉ để mở khóa khóa đã được bảo vệ trong kho khóa hệ điều hành.

- Nhật ký bảo mật không chứa dữ liệu bí mật; khóa phiên và đăng xuất từ xa.

# 2.2. Ngoài phạm vi MVP

Tự điền trình duyệt, extension, passkey sync, chia sẻ két sắt nhóm, quản lý doanh nghiệp, OCR giấy tờ, thanh toán, lưu CVV/PIN/OTP, hỗ trợ khôi phục bằng cách máy chủ đọc dữ liệu. Các tính năng này đánh giá ở giai đoạn sau.

# 3. Nhóm người dùng và kịch bản

| Vai trò           | Quyền                                                                                   |
|-------------------|-----------------------------------------------------------------------------------------|
| Người dùng        | Tạo và sử dụng két sắt cá nhân, quản lý thiết bị, xuất bản sao lưu                      |
| Quản trị vận hành | Giám sát hệ thống, tài khoản và số liệu không nhạy cảm; không xem được nội dung két sắt |
| Nhân viên hỗ trợ  | Hướng dẫn phục hồi truy cập tài khoản; không thể giải mã két sắt                        |

- US-01: Người dùng tạo tài khoản và thiết lập mật khẩu chính với cảnh báo không thể khôi phục dữ liệu nếu mất mọi khóa/bản sao.

- US-02: Thêm thông tin đăng nhập, sao chép mật khẩu có thời hạn xóa clipboard phù hợp nền tảng.

- US-03: Mất điện thoại, đăng nhập trên máy mới, xác thực và tải bản mã, mở khóa bằng mật khẩu chính.

- US-04: Chỉnh sửa cùng mục trên hai thiết bị; hệ thống phát hiện xung đột, không âm thầm ghi đè.

- US-05: Không có mạng vẫn xem/chỉnh sửa dữ liệu đã đồng bộ; khi có mạng đồng bộ hàng đợi.

- US-06: Người dùng thu hồi phiên/thiết bị thất lạc; hiểu rằng bản sao dữ liệu đã tải xuống có thể vẫn tồn tại trên thiết bị bị mất.

# 4. Yêu cầu chức năng chi tiết

| Mã    | Yêu cầu                                               | Ưu tiên |
|-------|-------------------------------------------------------|---------|
| FR-01 | Đăng ký email, xác minh, đăng nhập, chống brute force | P0      |
| FR-02 | Khởi tạo két sắt, tạo salt/KDF, mã hóa khóa dữ liệu   | P0      |
| FR-03 | CRUD mục, danh mục, tìm kiếm cục bộ sau giải mã       | P0      |
| FR-04 | Đồng bộ incremental, version/ETag, xung đột           | P0      |
| FR-05 | Offline cache mã hóa và hàng đợi thay đổi             | P0      |
| FR-06 | Khóa tự động, sinh trắc học qua keystore/keychain     | P0      |
| FR-07 | Sao lưu mã hóa, nhập lại, kiểm tra tính toàn vẹn      | P0      |
| FR-08 | Quản lý phiên, danh sách thiết bị, thu hồi token      | P0      |
| FR-09 | Tệp đính kèm mã hóa, giới hạn dung lượng              | P1      |
| FR-10 | TOTP lưu riêng, kiểm soát rủi ro tập trung            | P2      |
| FR-11 | Extension tự điền và passkey                          | P2      |

# 5. Yêu cầu phi chức năng

- NFR-01: Bảo mật theo OWASP ASVS cấp 2 phù hợp và OWASP MASVS cho mobile; threat modeling trước code.

- NFR-02: API TLS 1.3 ưu tiên, tối thiểu TLS 1.2; HSTS, CSP, chống XSS/CSRF tùy mô hình auth.

- NFR-03: Không ghi plaintext/secrets vào log, analytics, crash report, clipboard history hoặc notification.

- NFR-04: Khả năng khôi phục dịch vụ: mục tiêu đề xuất RPO ≤ 24 giờ, RTO ≤ 8 giờ; kiểm thử diễn tập.

- NFR-05: Mục tiêu hiệu năng: mở danh sách 1.000 mục trong \< 2 giây trên thiết bị tham chiếu; xác nhận qua benchmark.

- NFR-06: Hỗ trợ trình duyệt hiện đại, Android/iOS đang được nhà cung cấp hỗ trợ; accessibility cơ bản WCAG 2.2 AA.

- NFR-07: Giới hạn và bảo vệ metadata: máy chủ có thể thấy email, thời điểm đồng bộ, IP và kích thước bản mã; cần chính sách lưu giữ.

# 6. Kiến trúc đề xuất

Ứng dụng: Web Next.js/React + TypeScript; Mobile React Native + TypeScript (có native modules cho crypto và secure storage). API: ASP.NET Core hoặc NestJS (chốt sau spike); PostgreSQL cho metadata/bản mã; object storage cho tệp mã hóa; Redis cho rate limiting/queue; hệ thống email xác minh. Client sử dụng thư viện mật mã đã được kiểm toán, không tự viết thuật toán.

Luồng: Web/Android/iOS → HTTPS API → PostgreSQL (ciphertext + metadata) / Object Storage (encrypted blobs). Khóa mã hóa nội dung chỉ được giải mã trên thiết bị. Không dùng Next.js SSR để giải mã dữ liệu két sắt.

# 6.1. Phân tách khóa và giao thức mã hóa

- Mật khẩu chính → Argon2id (salt riêng, tham số hiệu chỉnh theo thiết bị) → KEK; không dùng trực tiếp mật khẩu để mã hóa từng mục.

- Sinh khóa dữ liệu két sắt ngẫu nhiên 256 bit (DEK/Vault Key); bọc khóa này bằng KEK bằng AEAD; lưu wrapped key + salt + thông số KDF.

- Mỗi mục dùng khóa dẫn xuất/khóa ngẫu nhiên riêng hoặc nonce duy nhất; AEAD AES-256-GCM (hoặc XChaCha20-Poly1305 nếu thư viện hỗ trợ và được duyệt).

- Nonce không bao giờ tái sử dụng với cùng khóa; xác thực associated data (ID, version, loại đối tượng) để chống tráo đổi.

- Mật khẩu đăng nhập dịch vụ và mật khẩu chính cần thiết kế phân tách; lựa chọn xác thực PAKE/OPAQUE hoặc mô hình verifier được đánh giá độc lập; tuyệt đối không gửi mật khẩu chính thô.

- Khóa thiết bị để mở bằng sinh trắc học được lưu trong Android Keystore/iOS Keychain, có kiểm soát khả năng xuất khóa và chính sách bảo vệ.

- Đổi mật khẩu chính: bọc lại Vault Key; xoay Vault Key khi nghi ngờ lộ khóa và mã hóa lại dữ liệu theo quy trình kiểm soát.

# 6.2. Mô hình tin cậy và rủi ro còn lại

Máy chủ không có khả năng giải mã nội dung nếu triển khai đúng. Tuy nhiên mã JavaScript Web bị máy chủ phân phối có thể bị thay đổi; cần CSP nghiêm ngặt, kiểm soát chuỗi cung ứng, release signing, review và phương án ứng dụng cài đặt độc lập. Thiết bị bị nhiễm mã độc hoặc đang mở khóa vẫn có nguy cơ lộ dữ liệu. Không cam kết “không bao giờ bị lộ”.

# 7. Mô hình dữ liệu mức logic

| Bảng/đối tượng   | Trường chính (không chứa plaintext nhạy cảm)                       |
|------------------|--------------------------------------------------------------------|
| users            | id, email, email_verified_at, created_at, status                   |
| auth_credentials | user_id, auth_protocol_version, verifier/public params             |
| vaults           | id, owner_id, kdf_params, wrapped_vault_key, key_version           |
| vault_items      | id, vault_id, ciphertext, nonce, aad_version, revision, deleted_at |
| devices          | id, user_id, device_label, last_seen_at, revoked_at                |
| sessions         | id, user_id, device_id, refresh_token_hash, expires_at             |
| attachments      | id, vault_id, object_key, encrypted_size, integrity_metadata       |
| audit_events     | id, user_id, action, timestamp, coarse context; no secrets         |

Các trường tiêu đề, URL, nhãn, tên ngân hàng và nội dung ghi chú nên nằm trong ciphertext để tránh rò rỉ metadata. Chỉ lưu các chỉ mục không nhạy cảm thật sự cần thiết.

# 8. Đặc tả API sơ bộ

| Method | Endpoint                | Mục đích                            |
|--------|-------------------------|-------------------------------------|
| POST   | /v1/auth/register       | Tạo tài khoản                       |
| POST   | /v1/auth/login/start    | Khởi tạo xác thực                   |
| POST   | /v1/auth/login/finish   | Hoàn tất xác thực, cấp phiên        |
| POST   | /v1/auth/refresh        | Làm mới phiên, rotation             |
| GET    | /v1/vault/bootstrap     | Lấy KDF params và wrapped key       |
| GET    | /v1/vault/items?cursor= | Tải thay đổi bản mã                 |
| PUT    | /v1/vault/items/{id}    | Upsert bản mã kèm If-Match revision |
| DELETE | /v1/vault/items/{id}    | Tombstone với revision              |
| POST   | /v1/vault/sync          | Đồng bộ batch idempotent            |
| GET    | /v1/devices             | Danh sách thiết bị                  |
| DELETE | /v1/sessions/{id}       | Thu hồi phiên                       |
| POST   | /v1/attachments/init    | Cấp quyền tải blob mã hóa           |

Quy ước: JSON UTF-8, UUID, cursor phân trang, Idempotency-Key cho mutation, optimistic concurrency (409 Conflict), 401/403/429 chuẩn hóa; không gửi khóa giải mã hoặc plaintext. Endpoint xác thực là sơ bộ, phải chốt theo giao thức xác thực được chọn.

# 9. Đồng bộ, offline và xung đột

- Mỗi bản ghi có revision server, updated_at và operation_id idempotent; client lưu encrypted cache + pending operations.

- Client gửi revision gốc. Nếu lệch: API trả 409 và hai phiên bản bản mã; client giải mã tại thiết bị và yêu cầu người dùng chọn/ghép nội dung.

- Xóa bằng tombstone để tránh mục cũ “sống lại” trên thiết bị offline; định kỳ dọn theo retention policy.

- Đồng bộ có cursor, retry exponential backoff, giới hạn kích thước payload, xử lý clock skew; không dựa vào timestamp client để quyết định phiên bản.

- Chế độ offline chỉ mở được nếu dữ liệu/khóa được lưu an toàn cục bộ và chính sách khóa cho phép.

# 10. Luồng UX và màn hình

M01 Giới thiệu → M02 Đăng ký/đăng nhập → M03 Tạo mật khẩu chính + xác nhận lưu mã khôi phục → M04 Két sắt tổng quan → M05 Danh sách mục → M06 Thêm/sửa mục → M07 Chi tiết & sao chép → M08 Tìm kiếm/bộ lọc → M09 Bộ sinh mật khẩu → M10 Thiết bị & phiên → M11 Sao lưu/khôi phục → M12 Cài đặt bảo mật → M13 Trợ giúp.

Nguyên tắc UX: không hiển thị mật khẩu mặc định; cảnh báo khi sao chép; tự khóa; xác nhận xóa; hỗ trợ font lớn; thuật ngữ tiếng Việt dễ hiểu; hướng dẫn rõ hậu quả mất mật khẩu chính.

# 11. Khôi phục và sao lưu

- Bản sao lưu mã hóa độc lập với tài khoản máy chủ, có version, KDF params, checksum/auth tag và thử khôi phục định kỳ.

- Khuyến nghị người dùng lưu mật khẩu chính trong trí nhớ và bản giấy ở nơi an toàn; mã khôi phục nếu triển khai phải có thiết kế mật mã cụ thể, không hứa “quên mật khẩu vẫn mở được” nếu không có khóa.

- Mất thiết bị: đăng nhập thiết bị mới, xác thực MFA dự phòng, lấy wrapped key + ciphertext, nhập mật khẩu chính để giải mã.

- Mất mật khẩu chính và mọi khóa/bản sao: dữ liệu không thể khôi phục theo mô hình zero-knowledge; hỗ trợ reset tài khoản nhưng phải mất quyền truy cập dữ liệu cũ.

- Sao lưu máy chủ mã hóa, phân vùng, kiểm thử restore; không nhầm backup server với bản xuất mã hóa của người dùng.

# 12. Bảo mật vận hành và tuân thủ

- Threat model: phishing, credential stuffing, XSS, supply-chain, thiết bị mất, máy chủ bị chiếm, replay, rollback, nonce reuse, metadata leakage, backup theft.

- MFA bằng passkey/WebAuthn hoặc TOTP; ưu tiên khóa bảo mật cho tài khoản nhạy cảm.

- Quy trình SDLC: SAST, DAST, dependency scanning, secret scanning, SBOM, code review 2 người cho crypto/auth, pentest độc lập.

- Quản lý secret hạ tầng qua secret manager; mã hóa backup; least privilege; audit trail; cảnh báo truy cập bất thường.

- Tuân thủ pháp luật Việt Nam về bảo vệ dữ liệu cá nhân và an ninh mạng; rà soát văn bản hiện hành với tư vấn pháp lý trước khi thương mại hóa.

- Không thu thập ảnh CCCD hoặc dữ liệu nhạy cảm ngoài mục đích người dùng chủ động lưu; chính sách xóa dữ liệu và xử lý yêu cầu của chủ thể dữ liệu.

# 13. Kiểm thử & tiêu chí nghiệm thu

| Nhóm        | Kịch bản bắt buộc                                                              |
|-------------|--------------------------------------------------------------------------------|
| Mã hóa      | Test vectors, tamper tag, sai mật khẩu, nonce uniqueness, thay đổi AAD         |
| Đa thiết bị | Web→Android→iOS, offline→online, xung đột 2 chiều                              |
| Khôi phục   | Mất điện thoại, đổi máy, mất mạng, backup corrupted, quên mật khẩu             |
| API         | Authz BOLA/IDOR, rate limit, replay, token rotation, session revocation        |
| Mobile      | Keystore/Keychain, screenshot/app switcher, rooted/jailbroken threat awareness |
| Web         | XSS, CSP, CSRF, clickjacking, caching sensitive data                           |
| Vận hành    | Backup restore, incident response, dependency compromise                       |

# 14. Kế hoạch triển khai đề xuất

| Giai đoạn                   | Thời lượng ước tính | Sản phẩm bàn giao                                                |
|-----------------------------|---------------------|------------------------------------------------------------------|
| 0\. Khảo sát & thiết kế     | 2 tuần              | PRD/SRS chốt, UX prototype, threat model, quyết định auth/crypto |
| 1\. Nền tảng & crypto spike | 3 tuần              | Monorepo, CI/CD, auth PoC, crypto SDK và test vectors            |
| 2\. Web MVP                 | 4 tuần              | Web CRUD, vault, sync, offline, backup                           |
| 3\. Mobile MVP              | 5 tuần              | Android/iOS, secure storage, sinh trắc học, sync                 |
| 4\. Hardening & QA          | 4 tuần              | Test E2E, pentest, sửa lỗi, diễn tập khôi phục                   |
| 5\. Beta có kiểm soát       | 2 tuần              | Phát hành beta, theo dõi lỗi, phản hồi UX                        |

Tổng: khoảng 20 tuần với các giai đoạn chủ yếu nối tiếp; lịch thực tế phụ thuộc quy mô đội, phạm vi, kiểm toán bảo mật và quy trình duyệt ứng dụng. Không đưa vào sử dụng cho bí mật thật trước khi hoàn tất hardening và đánh giá độc lập.

# 15. Nhân sự và chi phí dự trù

Đội gợi ý: 1 PM/BA (bán thời gian), 1 UX/UI, 1 frontend Web, 1–2 mobile, 1 backend, 1 QA automation, 1 security/crypto reviewer (theo đợt), 1 DevOps (bán thời gian). Chi phí phụ thuộc thuê ngoài hay nội bộ; chưa thể ước lượng đáng tin cậy nếu chưa chốt nhân sự, phạm vi, SLA và đơn vị kiểm toán. Lập dự toán riêng sau giai đoạn 0.

# 16. Backlog ưu tiên (P0)

- P0-01 Chốt mô hình xác thực tách biệt mật khẩu chính; review giao thức.

- P0-02 Thiết kế định dạng ciphertext, versioning, KDF, key rotation, test vectors.

- P0-03 Xây dựng UI tiếng Việt và thiết kế hệ thống component.

- P0-04 Backend đăng ký, xác minh, phiên, thiết bị, rate limiting.

- P0-05 Client vault CRUD, tìm kiếm cục bộ, bộ sinh mật khẩu.

- P0-06 Sync protocol, offline queue, conflict UX.

- P0-07 Backup/export/import, recovery drills.

- P0-08 QA security, pentest, beta gating.

# 17. Quyết định cần chốt trước khi lập trình

- Đối tượng sử dụng: cá nhân hay gia đình; hỗ trợ chia sẻ két sắt ở giai đoạn nào?

- Đăng nhập: email + mật khẩu riêng, passkey, hoặc giao thức PAKE được kiểm toán?

- Phạm vi tài liệu: có lưu bản scan giấy tờ/tệp đính kèm trong MVP hay chỉ metadata?

- Hạ tầng: cloud Việt Nam hay quốc tế; lưu trú dữ liệu và yêu cầu pháp lý?

- Khôi phục: recovery key độc lập, emergency kit hay chỉ mật khẩu chính + backup?

- Mức độ offline trên web: cache mã hóa IndexedDB và chính sách khóa?

- Mục tiêu số người dùng, SLA, ngân sách và thời hạn phát hành?

# 18. Tiêu chí Go/No-Go trước phát hành

GO chỉ khi: giao thức crypto/auth được chuyên gia độc lập phê duyệt; toàn bộ kiểm thử P0 đạt; pentest không còn Critical/High; kiểm thử khôi phục thành công; chính sách riêng tư/điều khoản đầy đủ; có runbook sự cố, backup, giám sát và quy trình cập nhật bảo mật. Nếu không đạt, chỉ cho phép dùng dữ liệu giả trong môi trường thử nghiệm.

Phụ lục — Nguyên tắc chuyển tiếp từ bản MVP HTML trước đó: coi bản demo chỉ là prototype; không tái sử dụng mặc định thiết kế lưu trữ, PBKDF2, xác thực hay code crypto khi chưa review. Thiết kế mới phải được triển khai và kiểm chứng độc lập.
