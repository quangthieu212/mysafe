# SG0 — Thiết lập GitHub và phát hành an toàn

Trạng thái: cấu hình repo đã chuẩn bị; các kiểm soát cấp tổ chức/repo chưa được bật vì workspace chưa có Git remote hoặc GitHub Organization để áp dụng và kiểm tra.

## Có trong repo

- `.github/workflows/codeql.yml`: CodeQL phân tích JavaScript/TypeScript trên PR, `main`, merge queue và lịch tuần. Workflow ghim SHA; chỉ cấp quyền đọc mã và ghi kết quả security scan.

- `.github/workflows/ci.yml`: CI cho pull request, push lên `main`, merge queue và chạy thủ công. Actions ghim commit SHA; quyền mặc định chỉ đọc nội dung; job kiểm tra không có quyền OIDC.
- Job kiểm tra chạy `npm ci --ignore-scripts`, `npm audit --audit-level=high` và `npm run check` trên GitHub-hosted runner dùng một lần.
- Job attest chỉ chạy sau push vào `main`; tạo SBOM CycloneDX, gói output build và tạo attestations với OIDC. Job này chưa triển khai lên production và chưa xác minh artifact tại cổng deploy.
- `.github/dependabot.yml`: kiểm tra npm và GitHub Actions hằng tuần. Cooldown 14 ngày áp dụng cho version updates npm; security updates không bị trì hoãn theo hành vi Dependabot hiện tại.

Artifact attestations cần quyền `id-token`, `attestations` và `artifact-metadata`. Với repository private/internal, GitHub yêu cầu gói Enterprise Cloud; cần xác nhận điều kiện này trước khi bật workflow trên repo riêng.

## Cần bật trong GitHub sau khi repo có remote

1. Organization: SSO và FIDO2/passkey bắt buộc cho mọi tài khoản có quyền ghi; cấm PAT cổ điển và rà soát owner.
2. Repository: secret scanning/push protection và code scanning; ruleset cho `main` và `release/*`, PR bắt buộc, cấm force-push và admin bypass, merge queue.
3. Owners: điền CODEOWNERS bằng tài khoản/team GitHub thật cho workflow, crypto/auth, API và cấu hình phát hành. Chưa tạo CODEOWNERS giả vì không biết username/team hợp lệ.
4. Required checks: đặt `CI / Verify` và `CodeQL / Analyze TypeScript` thành status check bắt buộc sau khi workflow chạy lần đầu; xác nhận CodeQL được hỗ trợ theo gói/quyền riêng tư của repository.
5. Environment production: hai người duyệt không phải tác giả, chờ tối thiểu 30 phút; không cho workflow hiện tại tự deploy.
6. Cloud/OIDC: tạo trust policy giới hạn repo, ref và environment; không lưu access key cloud dài hạn trong GitHub Secrets.
7. Monitoring: chuyển audit log GitHub, Actions và cloud sang hệ thống giám sát; cấu hình cảnh báo đăng nhập/token bất thường.
8. Runtime: chỉ sau khi có staging, áp dụng egress allowlist, database role tối thiểu và canary.
9. Supply chain: thêm bước verify attestation ở deploy; chỉ nhận digest đã ký. Hiện chưa có deploy pipeline hoặc cloud provider để cấu hình.
10. Diễn tập P1 và đặt lịch review/pentest độc lập trước SG0.

## Trạng thái SG0

Chưa qua SG0. Cấu hình workflow trong repo không thay thế branch ruleset, CODEOWNERS đã được GitHub nhận diện, bảo vệ danh tính tổ chức, giám sát ngoài băng, kiểm tra bypass hoặc diễn tập.
