# Kế hoạch triển khai backend và frontend Két Sắt Việt v2

## Tổng quan

Đưa prototype Next.js/SQLite hiện tại tiến dần tới v2 theo các lát cắt backend–frontend hoàn chỉnh, giữ dữ liệu prototype có thể đọc được trong giai đoạn chuyển tiếp. Tài liệu v2 là đích thiết kế; việc hoàn tất v2 còn cần hạ tầng, thư viện và đánh giá độc lập.

## Quyết định và ranh giới

- Dùng backlog v2 làm thứ tự ưu tiên: SG0/chuỗi cung ứng, mật mã và xác thực, backend/RLS, đồng bộ, thiết bị/khôi phục, web integrity, vận hành và hardening.
- Không tự xây giao thức OPAQUE, cơ chế ký/phê duyệt thiết bị hoặc hệ thống mật mã mới. Chỉ tích hợp sau khi có thư viện phù hợp và review độc lập.
- Lát cắt hiện tại thêm quản lý phiên trên backend hiện hữu và giao diện tiếng Việt. Đây là bước chuyển tiếp; chưa thay thế NestJS/PostgreSQL hay hoàn thành OPAQUE/device binding.
- Không khẳng định production-ready trước SG3 và các cổng review trong tài liệu.

## Các giai đoạn

### Giai đoạn 0 — SG0/chuỗi cung ứng (đang làm)

- [x] CodeQL cho TypeScript ghim SHA, chạy trên PR/main/merge queue và lịch tuần.

- [x] Workflow CI với Actions ghim SHA, quyền tối thiểu và GitHub-hosted runner dùng một lần.
- [x] Tạo SBOM CycloneDX và attest build/SBOM sau push main; chỉ job này có quyền OIDC.
- [x] Dependabot hằng tuần với cooldown 14 ngày cho npm version updates.
- [ ] Xác thực workflow trên GitHub và cấu hình `CI / Verify` thành required check.
- [ ] Organization/repo: SSO + FIDO2, CODEOWNERS thật, ruleset không bypass, secret scanning/push protection, environment hai người duyệt.
- [ ] Cloud/runtime: trust policy OIDC, verify attestation khi deploy, audit log/alert, egress allowlist/canary và diễn tập P1.

### Giai đoạn 1 — Phiên đăng nhập (đang làm)

- [x] Lưu ID và thời điểm tạo phiên, đồng thời backfill an toàn cho DB SQLite hiện hữu.
- [x] API liệt kê và thu hồi phiên của chính tài khoản; không trả session token/hash.
- [x] Giao diện xem phiên, thu hồi từng phiên và xử lý khi thu hồi phiên hiện tại.
- [x] Typecheck đạt.
- [x] Production build đạt sau lần chạy lại; Next.js vẫn cảnh báo phiên bản có lỗ hổng đã biết.
- [ ] Kiểm tra thủ công luồng API/UI.

### Giai đoạn 2 — Contract và nền tảng backend

- [ ] Đưa tài liệu v2 vào repo và chốt OpenAPI/contracts là nguồn sự thật.
- [ ] Dựng dịch vụ NestJS và PostgreSQL/migrations song song; giữ API cũ đến khi client chuyển xong.
- [ ] Bổ sung RLS, role DB tối thiểu, idempotency và kiểm thử cách ly tài khoản.

### Giai đoạn 3 — Auth và thiết bị

- [ ] Chọn, spike và review thư viện OPAQUE/Argon2id trên nền tảng đích.
- [ ] Triển khai OTP, refresh rotation/reuse detection, MFA và session/device binding.
- [ ] Xây luồng phê duyệt thiết bị QR/chữ ký, recovery và thông báo.

### Giai đoạn 4 — Web client và đồng bộ

- [ ] Chuyển UI sang API contract mới.
- [ ] Đồng bộ change sequence/cursor, tombstone, full resync và phát hiện rollback.
- [ ] CSP/Trusted Types/SRI, static hosting riêng và giám sát bundle.

### Giai đoạn 5 — Vận hành và cổng phát hành

- [ ] Backup/PITR, canary, cảnh báo, runbook và diễn tập.
- [ ] Hoàn tất review mật mã, pentest, pháp lý/DPIA và xử lý Critical/High trước beta.

## Rủi ro và phụ thuộc

| Rủi ro | Tác động | Giảm thiểu |
| --- | --- | --- |
| OPAQUE và ghép nối mật mã chưa được chọn/review | Không thể xác thực an toàn theo v2 | Không tự chế; spike thư viện và review độc lập trước tích hợp |
| Chuyển SQLite sang PostgreSQL có thể làm gián đoạn dữ liệu | Mất dữ liệu hoặc lệch contract | Chạy song song, migration có kiểm chứng, backup và rollback |
| Bảo vệ mã web không thể loại bỏ rủi ro kênh phát hành | Mã độc có thể lấy plaintext trên client | Tách static host, chữ ký, giám sát độc lập và ghi rõ rủi ro còn lại |
| Tác vụ GitHub/cloud cần quyền tổ chức và nhà cung cấp | Không thể hoàn tất chỉ bằng code repo | Tạo cấu hình trong repo; đánh dấu các thiết lập bên ngoài là cổng vận hành |

## Thứ tự

1. Giai đoạn 1: quản lý phiên (đang triển khai).
2. Giai đoạn 2: contract/backend nền tảng.
3. Giai đoạn 3: auth/thiết bị sau spike và review.
4. Giai đoạn 4: chuyển web và đồng bộ.
5. Giai đoạn 5: vận hành, hardening, SG0–SG4.
