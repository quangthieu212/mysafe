# Checklist Két Sắt Việt

Cập nhật: 27/11/2026. `[x]` có bằng chứng hoàn tất trong phạm vi ghi rõ; `[ ]` chưa xong. Prototype local không đồng nghĩa public beta.

## Triển khai bộ v2 (bắt đầu 27/11/2026)

### Bước 1 — SG0 / chuỗi cung ứng

- [x] `.github/workflows/codeql.yml`: CodeQL cho JavaScript/TypeScript ghim SHA, quyền tối thiểu.

- [x] `.github/workflows/ci.yml`: actions ghim SHA, quyền `contents: read`, verify trên PR/main/merge queue; install locked deps, audit và check.
- [x] Chỉ job attest trên push `main` có `id-token: write`; tạo CycloneDX SBOM và attest build + SBOM.
- [x] `.github/dependabot.yml`: npm version updates có cooldown 14 ngày, actions được kiểm tra hằng tuần.
- [x] Ghi các cấu hình GitHub ngoài repo và điều kiện SG0 tại `docs/security/SG0-github-setup.md`.
- [ ] Chưa chạy được workflow: workspace không có Git remote/Organization.
- [ ] SSO/FIDO2, CODEOWNERS với owner thật, branch ruleset, secret scanning/push protection, required checks và environment production chưa được bật.
- [ ] Chưa cấu hình cloud OIDC/deploy verification, log monitoring, egress/canary hoặc diễn tập P1.

- [x] FE: wrapped key mới chuẩn hóa mật khẩu chính NFKC; descriptor legacy giữ nguyên hành vi.
- [x] BE: lưu `normalization: "NFKC"` qua validation descriptor.
- [x] BE: migration SQLite thêm ID/thời điểm phiên, backfill phiên cũ.
- [x] BE: API liệt kê/thu hồi phiên, phân quyền theo user và không trả token/hash.
- [x] FE: xem phiên và thu hồi phiên, xóa plaintext khỏi trạng thái giao diện khi thu hồi phiên hiện tại.
- [x] Typecheck.
- [ ] Test vector NFC/NFD, integration test quyền sở hữu/revoke, browser QA.
- [ ] NestJS/PostgreSQL, OPAQUE, MFA, gắn thiết bị, change_seq/RLS, web integrity và các cổng SG0–SG4 (xem `tasks/plan.md`).

## Đã chốt và đã triển khai trong prototype local

- [x] Chốt cá nhân, miễn phí dùng thử, chữ và trường tùy chỉnh.
- [x] Chốt web responsive; đồng bộ, sao lưu, khôi phục bắt buộc.
- [x] Đọc bộ 11 tài liệu Markdown; lưu định hướng và đối chiếu tại `docs/ideas/` và `docs/planning/`.
- [x] Lập đặc tả MVP web tại `docs/SPEC-web-mvp.md`.
- [x] Next.js App Router, TypeScript, dependency lock và lệnh chạy/build.
- [x] Mô hình mục/field, validation và giới hạn payload.
- [x] Client crypto: Argon2id key wrapping, AES-GCM snapshot, recovery code, file backup.
- [x] Đăng ký/đăng nhập prototype, cookie HttpOnly, mật khẩu dịch vụ tách khỏi master password.
- [x] API ciphertext, kiểm tra vault theo user, CAS revision, replay/idempotency cơ bản, lịch sử snapshot.
- [x] UI tiếng Việt responsive: CRUD, tìm kiếm, trường bí mật, tự khóa 5 phút.
- [x] IndexedDB chỉ lưu bản mã và trạng thái chờ; khi đăng nhập lại thử đồng bộ thay đổi offline.
- [x] Xung đột giữ hai bản; lựa chọn giữ server hoặc tạo bản sao từ local.
- [x] Thùng rác mã hóa dạng tombstone và khôi phục được.
- [x] Khôi phục backup/lịch sử thành revision mới.
- [x] README hướng dẫn chạy và nêu giới hạn local.

## Đã kiểm chứng

- [x] `npm run typecheck` đạt sau các thay đổi chính.
- [x] `npm run build` đạt; sinh trang và ba API route.
- [x] Npm audit production qua registry HTTPS: 0 vulnerability tại thời điểm kiểm tra.

## Chưa kiểm chứng hoặc còn thiếu trong prototype

- [x] Unit tests cho xác thực dữ liệu, giới hạn items/fields, mã hóa snapshot, phát hiện sửa ciphertext, mở khóa bằng mật khẩu/mã khôi phục và cấu trúc backup; 6/6 đạt.
- [x] Integration HTTP cho auth/sync/restore trên production server local và SQLite tạm: 3/3 đạt; kiểm tra cookie, logout từng phiên, origin, cách ly tài khoản, ghi đồng thời/CAS, replay và restore thành revision mới.
- [x] E2E Chrome cho tạo tài khoản, đăng xuất/đăng nhập, mở khóa bằng mật khẩu chính/mã khôi phục và tải lại trang; 1/1 đạt.
- [x] E2E Chrome trên hai browser context độc lập: đồng bộ dữ liệu sau khi đăng nhập lại; tải file backup, nhập và khôi phục snapshot thành revision mới; 1/1 đạt.
- [x] Kiểm tra responsive tự động trên Chrome tại 320/768/1024/1440 px: không tràn ngang, các hành động chính hiện rõ.
- [x] Kiểm tra bàn phím và accessibility cơ bản: focus nhìn thấy sau Tab, mọi nút có accessible name; không có lỗi JS/console bất ngờ trong các luồng E2E.
- [ ] Kiểm tra accessibility tree/screen reader, độ tương phản và duyệt giao diện thủ công trên thiết bị thật.
- [x] Cold start khi offline trên thiết bị đã có bản mã: service worker cache app shell/tài nguyên tĩnh, mở snapshot IndexedDB bằng master/recovery secret và tự đồng bộ thay đổi khi mạng trở lại; API không được cache.
- [ ] Server backup ngoài máy/host, chạy theo lịch, cảnh báo, retention của backup và diễn tập restore.
- [x] Server giữ tối đa 20 snapshot mới nhất cho mỗi két; xóa payload cũ trong cùng transaction ghi/khôi phục. Ledger hash thao tác riêng duy trì replay idempotent sau khi snapshot bị dọn.
- [x] Xóa tài khoản prototype yêu cầu xác nhận email + mật khẩu đăng nhập; xóa user, mọi session, snapshot và operation ledger qua foreign-key cascade; xóa cache IndexedDB trên thiết bị hiện tại.
- [ ] Purge tombstone và xóa cache/backup trên thiết bị khác hoặc file đã tải xuống; chưa có dịch vụ thu hồi bản sao ngoại tuyến.
- [ ] Giới hạn dung lượng/lịch sử được thực thi phía server.
  - [x] Giới hạn kích thước request JSON theo stream, kể cả thiếu `Content-Length`; 413 khi vượt trần. Snapshot/restore: 2 MiB + 16 KiB cho JSON envelope; auth: 16 KiB; xác nhận xóa: 2 KiB.
  - [ ] Chưa có quota tổng dung lượng database theo tài khoản; history cap 20 snapshot đã được triển khai riêng.
- [ ] Quên mật khẩu đăng nhập, xác minh email, MFA và thu hồi thiết bị.
- [ ] Đổi mật khẩu chính/mã khôi phục, key rotation và rollback detection.
- [ ] PostgreSQL/migrations và dịch vụ triển khai.

## Cổng bắt buộc trước public beta với dữ liệu thật

- [ ] Review độc lập auth/crypto, threat model, thư viện và KDF trên thiết bị mục tiêu.
- [ ] Chốt giao thức auth production; tuyệt đối không dùng `authVerifier/proof` placeholder.
- [ ] Hoàn tất kiểm soát CSP/XSS/CSRF, rate limiting phân tán, secrets và HTTPS.
- [ ] Pentest độc lập, xử lý hết Critical/High, diễn tập mất máy/mất khóa/hỏng backup/khôi phục.
- [ ] Chốt quota, retention, xóa tài khoản, hosting, ngân sách và chính sách riêng tư.
- [ ] Monitoring, runbook sự cố, CI và điều kiện phát hành.

## Ngoài MVP

- Ảnh/PDF/tệp, ứng dụng native, chia sẻ nhóm, autofill và AI đọc nội dung.

## Nhật ký tiến độ

2026-11-27 — Áp dụng NFKC cho wrapping key mới theo descriptor marker, giữ cách dẫn xuất legacy; API validation bảo toàn marker. Thêm migration/session API liệt kê và thu hồi cùng UI quản lý phiên. `npm run typecheck` đạt. Chưa chạy test suite hoặc kiểm tra trình duyệt; còn thiếu test vectors NFC/NFD, kiểm tra quyền/revoke và gắn session với thiết bị.

2026-10-29 — Đã có prototype Next.js/SQLite; typecheck/build đạt; audit production dependencies báo 0 lỗ hổng. Chưa chạy kiểm chứng trên browser và chưa có test tự động; chỉ dùng dữ liệu giả.
2026-10-29 — Thêm `npm test` (Node test runner + tsx), 6 unit tests đạt; `npm run check` hiện chạy typecheck, tests và production build, cả ba đều đạt. Integration/E2E và kiểm tra browser vẫn chưa làm.
2026-10-30 — Thêm `npm run test:integration`: build rồi chạy 3 HTTP integration tests với server riêng trên port tự cấp và thư mục SQLite tạm được dọn sau test. `npm run check` đạt: typecheck, 6 unit tests, production build và 3 integration tests. Chưa kiểm chứng giao diện/browser; không thay đổi trạng thái public beta.
2026-10-30 — Sửa luồng xác thực để đăng nhập tài khoản xong chuyển sang bước mở két; mở khóa dùng phiên hiện có, hỗ trợ đăng xuất từ màn hình khóa, và mã khôi phục được chuẩn hóa nhất quán khi tạo/sử dụng. Playwright trên Chrome đạt luồng tạo tài khoản → đăng xuất → đăng nhập → nhập sai mật khẩu chính → mở két → tải lại → mở bằng recovery code. `npm run check` cũng đạt. Còn thiếu E2E sync đa browser và backup import/export.
2026-11-02 — Thêm Playwright E2E đồng bộ qua hai browser context có IndexedDB riêng và backup export/import trên production server với SQLite test riêng. `npm run test:e2e` đạt 2/2; gồm auth/unlock và sync/restore. Chưa kiểm tra thủ công viewport/accessibility; các giới hạn public beta không đổi.
2026-11-02 — Mở rộng E2E để kiểm tra viewport 320/768/1024/1440 px, tràn ngang, hành động chính, tên accessible của nút, focus bàn phím và lỗi browser. `npm run test:e2e` đạt 2/2. Phản hồi 401 từ lần kiểm tra phiên đăng xuất được bỏ qua có chủ đích; không phát hiện lỗi khác. Screen reader, contrast và kiểm tra thiết bị thật còn lại.
2026-11-02 — Thêm retention phía server: chỉ giữ 20 snapshot mới nhất cho mỗi két sau cả ghi thường lẫn restore; ledger SHA-256 riêng giữ kết quả idempotency khi payload lịch sử bị dọn, đồng thời backfill ledger cho snapshot cũ lúc mở DB. Integration test kiểm tra 22 revision, còn đúng revision 3–22 và replay revision 1 vẫn idempotent. `npm run check` đạt: typecheck, 6 unit, build, 4 integration tests.
2026-11-02 — Thêm xóa tài khoản với xác nhận cùng origin, email và mật khẩu đăng nhập; sai xác nhận không xóa, đúng xác nhận xóa dữ liệu server theo cascade và thu hồi mọi session. Client xóa IndexedDB hiện tại, xóa root key khỏi RAM và thông báo rõ cache ở thiết bị khác/file backup còn tồn tại. `npm run check` đạt (6 unit, 5 integration); `npm run test:e2e` đạt 3/3 gồm xác nhận sai/đúng và đăng nhập sau xóa bị từ chối.
2026-11-03 — Làm rõ xóa tài khoản là xóa logic khỏi database ứng dụng, không đảm bảo sanitization vật lý khỏi file/WAL; modal cũng cảnh báo không thể thu hồi cache thiết bị khác hoặc backup đã tải. Chạy lại `npm run check` và `npm run test:e2e`: 6 unit, 5 integration, build/typecheck và 3 E2E đều đạt.
2026-11-03 — Thêm service worker production chỉ cache `/` và tài nguyên tĩnh `/_next/static/`, bỏ qua toàn bộ API; mở khóa cache IndexedDB cục bộ khi cold start offline và tự đồng bộ thay đổi sau reconnect. Playwright Chrome xác nhận reload offline, mở bằng mật khẩu, ghi offline, không nhận API response từ cache và đồng bộ lại. `npm run test:e2e` đạt 4/4; `npm run check` đạt 6 unit, 5 integration, build và typecheck.
2026-11-03 — Giới hạn body JSON bằng stream ở các API tài khoản, ghi snapshot và khôi phục; request quá cỡ trả 413 kể cả khi bỏ `Content-Length`. Integration test phủ body stream lớn cho cả vault/history. `npm run check` đạt 6 unit, 6 integration, build/typecheck; `npm run test:e2e` đạt 4/4. Quota tổng database theo tài khoản và offsite backup vẫn còn.
