# Sơ đồ sync-conflict

```mermaid
sequenceDiagram
 participant A as Thiết bị A
 participant S as Sync API
 participant D as Database
 participant B as Thiết bị B
 A->>S: PUT item expectedRevision=4
 S->>D: CAS update 4 -> 5
 S-->>A: 200 revision=5
 B->>S: PUT item expectedRevision=4
 S-->>B: 409 conflict + currentRevision=5
 B->>S: GET item ciphertext revision=5
 B->>B: Giải mã cục bộ; yêu cầu chọn/merge an toàn
 B->>S: PUT item expectedRevision=5
 S-->>B: 200 revision=6
```
