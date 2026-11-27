# Đối chiếu tài liệu với MVP Két Sắt Việt

Ngày: 28/10/2026. Đây là kết quả đọc và đối chiếu tài liệu, chưa phải kiểm toán bảo mật hoặc hợp đồng triển khai đã hoàn thiện.

## 1. Phạm vi đã chốt

Nguồn quyết định sản phẩm: [định hướng MVP](../ideas/ket-sat-viet.md) và trao đổi với chủ dự án.

- Một người phát triển; dùng cho cá nhân và mở miễn phí cho mọi người dùng thử.
- Lưu chữ và trường tùy chỉnh; chưa lưu ảnh, PDF hoặc tệp đính kèm.
- Đồng bộ, sao lưu và khôi phục bắt buộc có ngay trong bản đầu.
- Tiếng Việt, thao tác đơn giản; chưa có chia sẻ nhóm hoặc autofill.
- Nền tảng đầu tiên đã chốt: web responsive dùng trên điện thoại và máy tính; chưa xây ứng dụng Android/iOS riêng. Khả năng cài đặt dạng PWA chưa phải yêu cầu đã chốt.
- Ngân sách, hạn mức và lịch phát hành chưa được chủ dự án chốt.

## 2. Tài liệu đã đọc

Các đường dẫn dưới đây thuộc [bộ Markdown](../../Ket_Sat_Viet_Toan_Bo_Tai_Lieu_MD/README.md):

| Tài liệu | Vai trò |
| --- | --- |
| `README.md` | Phạm vi và cách dùng bộ chuyển đổi |
| `ke-hoach/Ke_hoach_va_Dac_ta_He_thong_Ket_Sat_Viet.md` | PRD/SRS, mục tiêu, kế hoạch và điều kiện phát hành |
| `ky-thuat/Technical_Design_Ket_Sat_Viet.md` | Thiết kế kiến trúc, mã hóa, đồng bộ và kiểm thử |
| `ky-thuat/api/openapi.yaml.md` | Hợp đồng API dự thảo |
| `ky-thuat/database/schema.sql.md` | DDL tham khảo |
| `ky-thuat/diagrams/architecture.mmd.md` | Kiến trúc |
| `ky-thuat/diagrams/encryption-flow.mmd.md` | Luồng mã hóa |
| `ky-thuat/diagrams/erd.mmd.md` | Quan hệ dữ liệu |
| `ky-thuat/diagrams/sync-conflict.mmd.md` | Xử lý xung đột |
| `ky-thuat/ui/screen-inventory.csv.md` | Danh sách 14 màn hình |
| `ky-thuat/ui/wireframes.html.md` | Mã mô phỏng tĩnh, chưa phải ứng dụng |

## 3. Những điểm phải điều chỉnh theo quyết định mới

| Trong tài liệu tham khảo | Cách xử lý cho MVP |
| --- | --- |
| PRD §2.1 gọi là bản thương mại thử nghiệm | Dùng cho cá nhân và mở dùng thử miễn phí; chưa có mục tiêu thương mại |
| Web + Android + iPhone ngay trong phạm vi tổng thể | Bản đầu chỉ xây web responsive cho điện thoại và máy tính; ứng dụng Android/iOS riêng nằm ngoài MVP |
| Attachment, object storage và S09 có chọn tệp | Bỏ tính năng tệp khỏi MVP; giấy tờ được lưu thông tin dạng chữ. Kho lưu bản sao hạ tầng vẫn có thể cần riêng |
| PRD §11 mô tả mã khôi phục có điều kiện “nếu triển khai” | Luồng khôi phục là bắt buộc; phải đặc tả bí mật khôi phục và cách lấy lại quyền truy cập |
| Technical Design §11 đưa backup vào sprint 7 | Đưa định dạng backup và thử restore vào giai đoạn nền tảng; hoàn thiện trước khi dùng dữ liệu thật |
| PRD §14–15 dự kiến khoảng 20 tuần và một đội nhiều vai trò | Không áp lịch đó cho một người; ước lượng lại sau khi chọn nền tảng và hoàn thành thử nghiệm kỹ thuật |
| UI S07 thiên về username/password/URL | Cần trình chỉnh sửa trường tự do; mẫu tài khoản chỉ là một mẫu có sẵn |

## 4. Khoảng trống cần giải quyết trước khi triển khai phần liên quan

Các phát hiện dưới đây dựa trên nội dung bản dự thảo; không khẳng định tồn tại lỗ hổng trong phần mềm vì chưa có ứng dụng để kiểm thử.

| Mức | Bằng chứng trong tài liệu | Việc cần hoàn thiện |
| --- | --- | --- |
| P0 | OpenAPI có `authVerifier` và `proof`; chính Technical Design §4.3 nói đây là placeholder | Chọn và đánh giá giao thức xác thực, đặc tả luồng đăng ký/đăng nhập/refresh; không dùng trường mẫu như một giao thức hoàn chỉnh |
| P0 | OpenAPI chỉ có `/recovery/status`, chưa có luồng tạo, dùng hoặc thay bí mật khôi phục | Tách khôi phục truy cập tài khoản và giải mã dữ liệu; giải quyết trường hợp mất mọi thiết bị, mất MFA và quên mật khẩu chính |
| P0 | PRD §11 yêu cầu backup độc lập nhưng chưa có định dạng trao đổi đầy đủ | Định nghĩa version, dữ liệu và khóa được bọc cần mang theo, kiểm tra toàn vẹn, cách mở không phụ thuộc dịch vụ, cách nhập và xử lý trùng mục |
| P0 | Technical Design §4.2 dùng itemKey riêng, AAD chứa ID/revision/keyVersion; ItemWrite và SQL chưa thể hiện đầy đủ envelope tương ứng | Chốt vị trí wrapped item key, keyVersion và metadata phiên bản; quy tắc cấp ID trước mã hóa và quy tắc revision khi ghi/retry. Không tự điền chi tiết mật mã từ suy đoán |
| P0 | SQL `item_revisions` chỉ có item ID, revision, ciphertext, nonce và thời điểm | Lịch sử phải giữ đủ ngữ cảnh giải mã của từng phiên bản; không lệ thuộc mù quáng vào schema/key hiện tại |
| P0 | Có revision trên item/vault nhưng chưa có đặc tả thứ tự change feed và cursor | Xác định trình tự thay đổi xuyên nhiều mục, phân trang, cursor hết hạn, tombstone và full resync; chứng minh không bỏ sót khi nhiều mục có cùng revision |
| P0 | Technical Design yêu cầu idempotency; OpenAPI chưa mô tả header/hợp đồng replay | Chốt phạm vi khóa thao tác, payload tương ứng, thời gian lưu kết quả và hành vi gửi lại sau khi mất phản hồi |
| P0 | `/vaults`, `/devices`, `/recovery/status` dùng schema `Error` cho phản hồi 200; nhiều lỗi chỉ có description | Hoàn thiện request/response và cấu trúc lỗi thực tế trước khi sinh client hoặc backend từ OpenAPI |
| P0 | `/auth/refresh` kế thừa bearer auth toàn cục, chưa có request/credential riêng | Đặc tả refresh khi access token hết hạn, khác biệt cookie web/token mobile và rotation; không để hợp đồng yêu cầu token còn hạn để gia hạn |
| P0 | SQL sessions có user và device riêng; device_key_wraps có vault và device riêng | Đặc tả và kiểm thử quyền sở hữu nhất quán, gồm tình huống ID thuộc người dùng khác; schema hiện tại chưa tự thể hiện mọi ràng buộc này |
| P0 | Backup có yêu cầu nhưng chưa chốt lịch, retention, đích lưu và quyền xóa | Phân biệt bản sao vận hành, lịch sử người dùng và file xuất độc lập; thử sự cố mất dịch vụ, không chỉ xóa nhầm một mục |
| P1 | Wireframe là các thẻ tĩnh lặp lại, chưa mô tả đầy đủ thao tác | Bổ sung UI trường tùy chỉnh, xung đột, thùng rác, lịch sử, kiểm tra mã khôi phục và trạng thái backup |

## 5. Các tình huống khôi phục phải tách riêng

| Tình huống | Kết quả cần chứng minh |
| --- | --- |
| Mất điện thoại, còn mật khẩu chính | Xác thực trên thiết bị mới và mở được dữ liệu; không bắt buộc phê duyệt từ thiết bị đã mất |
| Quên mật khẩu chính, còn bí mật khôi phục | Có luồng lấy lại quyền truy cập cần thiết và mở dữ liệu; chỉ đặt lại mật khẩu đăng nhập là chưa đủ |
| Mất phương thức MFA hoặc email | Chính sách truy cập tài khoản rõ ràng; khả năng giải mã và khả năng tải bản mã là hai việc riêng |
| Xóa hoặc sửa nhầm | Khôi phục trong thời hạn giữ lịch sử/thùng rác, rồi đồng bộ kết quả như thay đổi mới |
| Máy chủ hỏng hoặc dịch vụ ngừng hoạt động | Thử phục hồi vận hành và mở file backup độc lập bằng bí mật hợp lệ |
| Backup hỏng hoặc dùng sai bí mật | Báo lỗi rõ, không ghi đè dữ liệu hiện có và không báo phục hồi thành công |
| Mất mọi phương thức mở khóa và bí mật khôi phục | Giải thích giới hạn; không hứa khôi phục nội dung khi không có khóa hợp lệ |

## 6. Thứ tự tiếp tục đề xuất

1. **Đặc tả MVP thống nhất:** chuyển phạm vi đã chốt thành hành vi nghiệm thu, nhất là trường tùy chỉnh và sáu luồng: tạo két, lưu mục, đồng bộ, xung đột, sao lưu, khôi phục.
2. **Cụ thể hóa nền tảng web và ràng buộc vận hành:** web responsive đã được chủ dự án chọn; tiếp tục xác định thiết bị/trình duyệt mục tiêu, số người dùng thử, ngân sách và retention. Khả năng cài đặt dạng PWA cần đánh giá riêng.
3. **Thử nghiệm nền tảng với dữ liệu giả:** xác thực, envelope mã hóa, mở trên hai thiết bị và export/import backup; đánh giá thiết kế trước khi mở rộng UI.
4. **Hoàn thiện hợp đồng:** đồng bộ API, SQL, envelope và quy tắc change feed; bổ sung lịch sử, tombstone, retry và quyền sở hữu.
5. **Xây luồng xuyên suốt:** tạo mục → đồng bộ → sửa xung đột → backup → khôi phục trên môi trường sạch. Mỗi bước có kiểm chứng trước khi thêm tiện ích.
6. **Diễn tập và đánh giá trước beta thật:** mất máy, quên mật khẩu, dịch vụ gián đoạn, backup hỏng, truy cập chéo tài khoản; hoàn thành điều kiện phát hành từ PRD §18.

PRD §5 đã đề xuất RPO ≤ 24 giờ và RTO ≤ 8 giờ cho phục hồi dịch vụ. Giữ chúng là mục tiêu tham khảo chưa được xác nhận cho dự án một người; không hiểu là độ trễ đồng bộ, cam kết SLA hoặc bằng chứng đã đạt.

## 7. Quyết định nền tảng và hệ quả cho đặc tả

Chủ dự án đã chọn web dùng được trên điện thoại và máy tính. Bản đầu dùng giao diện responsive; không có ứng dụng Android/iOS riêng. Yêu cầu đồng bộ, sao lưu và khôi phục không thay đổi.

- Đặc tả giao diện cần bao phủ cảm ứng, bàn phím, màn hình nhỏ và màn hình máy tính.
- Luồng thiết bị mới và đồng bộ phải được thử giữa hai môi trường trình duyệt độc lập, không chỉ hai tab dùng chung bộ nhớ.
- Chỉ hiển thị “đã đồng bộ” khi máy chủ xác nhận; phân biệt với trạng thái “đã lưu trên thiết bị”.
- Cần mô tả hành vi khi đóng trình duyệt, mất mạng, phiên hết hạn, cache bị xóa và khi mở lại; không hứa đồng bộ nền hoặc xuất backup tự động lúc trình duyệt đóng nếu chưa chứng minh được.
- Tách sao lưu tự động ở phía dịch vụ và file xuất mã hóa người dùng tải về. Xóa dữ liệu trình duyệt không được coi là xóa tài khoản hoặc xóa dữ liệu trên máy chủ.
- Giữ các yêu cầu bảo vệ web trong tài liệu nguồn, gồm mã hóa ở client, không giải mã bằng SSR, không lưu khóa dạng rõ lâu dài và đánh giá XSS/chuỗi cung ứng.
- Sinh trắc học qua Keystore/Keychain của ứng dụng native không mặc nhiên áp dụng cho bản web; phương thức mở khóa trên web cần được đặc tả riêng.

Bước tiếp theo: đặc tả MVP web với tiêu chí nghiệm thu cho tạo két, trường tùy chỉnh, đồng bộ, xung đột, sao lưu và khôi phục. Ngân sách, quota, retention và danh sách trình duyệt còn mở; chưa coi mục tiêu vận hành tham khảo là cam kết.
