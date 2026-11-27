# Đặc tả OpenAPI 3.0.3

> Đây là bản trình bày Markdown của tệp `api/openapi.yaml`. Để chạy bằng công cụ chuyên dụng, trích nội dung trong khối mã ra đúng định dạng gốc.

```yaml
openapi: 3.0.3
info:
  title: Két Sắt Việt API
  version: 1.0.0-draft
  description: Zero-knowledge-oriented API draft. Authentication protocol and verifier require independent cryptographic
    review before implementation.
servers:
- url: https://api.example.invalid/v1
  description: Placeholder only
tags:
- name: Auth
- name: Vaults
- name: Items
- name: Sync
- name: Devices
- name: Recovery
- name: Attachments
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    Error:
      type: object
      required:
      - code
      - message
      - requestId
      properties:
        code:
          type: string
        message:
          type: string
        requestId:
          type: string
    VaultItem:
      type: object
      required:
      - id
      - vaultId
      - revision
      - schemaVersion
      - ciphertext
      - nonce
      - aadVersion
      properties:
        id:
          type: string
          format: uuid
        vaultId:
          type: string
          format: uuid
        revision:
          type: integer
          format: int64
        schemaVersion:
          type: integer
        ciphertext:
          type: string
          description: base64url encrypted payload incl. authentication tag
        nonce:
          type: string
          description: base64url 96-bit nonce
        aadVersion:
          type: integer
        deletedAt:
          type: string
          format: date-time
          nullable: true
    ItemWrite:
      type: object
      required:
      - schemaVersion
      - ciphertext
      - nonce
      - aadVersion
      - expectedRevision
      properties:
        schemaVersion:
          type: integer
        ciphertext:
          type: string
        nonce:
          type: string
        aadVersion:
          type: integer
        expectedRevision:
          type: integer
          minimum: 0
    RegisterRequest:
      type: object
      required:
      - email
      - authVerifier
      - kdfParams
      - encryptedRootKey
      - deviceName
      - devicePublicKey
      properties:
        email:
          type: string
          format: email
        authVerifier:
          type: string
        kdfParams:
          type: object
          additionalProperties: true
        encryptedRootKey:
          type: string
        deviceName:
          type: string
        devicePublicKey:
          type: string
    LoginRequest:
      type: object
      required:
      - email
      - proof
      - deviceId
      properties:
        email:
          type: string
          format: email
        proof:
          type: string
        deviceId:
          type: string
          format: uuid
    Tokens:
      type: object
      required:
      - accessToken
      - expiresIn
      properties:
        accessToken:
          type: string
        expiresIn:
          type: integer
        refreshToken:
          type: string
          description: mobile only; web uses Secure HttpOnly cookie
    Device:
      type: object
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        status:
          type: string
          enum:
          - pending
          - active
          - revoked
        publicKey:
          type: string
    SyncResult:
      type: object
      properties:
        cursor:
          type: string
        items:
          type: array
          items:
            $ref: '#/components/schemas/VaultItem'
        hasMore:
          type: boolean
security:
- bearerAuth: []
paths:
  /auth/register:
    post:
      tags:
      - Auth
      summary: Register encrypted root key and verifier
      operationId: post_auth_register
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Tokens'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RegisterRequest'
      security: []
  /auth/login:
    post:
      tags:
      - Auth
      summary: Authenticate with reviewed challenge-response protocol
      operationId: post_auth_login
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Tokens'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      security: []
  /auth/refresh:
    post:
      tags:
      - Auth
      summary: Rotate refresh session
      operationId: post_auth_refresh
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Tokens'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
  /auth/logout:
    post:
      tags:
      - Auth
      summary: Revoke current session
      operationId: post_auth_logout
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
  /vaults:
    get:
      tags:
      - Vaults
      summary: List own vaults
      operationId: get_vaults
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
  /vaults/{vaultId}/items:
    get:
      tags:
      - Items
      summary: List encrypted item envelopes
      operationId: get_vaults_vaultId_items
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SyncResult'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      parameters:
      - name: vaultId
        in: path
        required: true
        schema:
          type: string
          format: uuid
    post:
      tags:
      - Items
      summary: Create encrypted item with expectedRevision=0
      operationId: post_vaults_vaultId_items
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VaultItem'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ItemWrite'
      parameters:
      - name: vaultId
        in: path
        required: true
        schema:
          type: string
          format: uuid
  /vaults/{vaultId}/items/{itemId}:
    get:
      tags:
      - Items
      summary: Get ciphertext item
      operationId: get_vaults_vaultId_items_itemId
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VaultItem'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      parameters:
      - name: vaultId
        in: path
        required: true
        schema:
          type: string
          format: uuid
      - name: itemId
        in: path
        required: true
        schema:
          type: string
          format: uuid
    put:
      tags:
      - Items
      summary: Compare-and-swap encrypted item
      operationId: put_vaults_vaultId_items_itemId
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VaultItem'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ItemWrite'
      parameters:
      - name: vaultId
        in: path
        required: true
        schema:
          type: string
          format: uuid
      - name: itemId
        in: path
        required: true
        schema:
          type: string
          format: uuid
    delete:
      tags:
      - Items
      summary: Soft delete with revision guard
      operationId: delete_vaults_vaultId_items_itemId
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      parameters:
      - name: vaultId
        in: path
        required: true
        schema:
          type: string
          format: uuid
      - name: itemId
        in: path
        required: true
        schema:
          type: string
          format: uuid
      - name: If-Match
        in: header
        required: true
        schema:
          type: integer
  /sync/changes:
    get:
      tags:
      - Sync
      summary: Cursor-based encrypted change feed
      operationId: get_sync_changes
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SyncResult'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      parameters:
      - name: cursor
        in: query
        required: false
        schema:
          type: string
      - name: limit
        in: query
        schema:
          type: integer
          minimum: 1
          maximum: 200
  /devices:
    get:
      tags:
      - Devices
      summary: List devices
      operationId: get_devices
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
  /devices/{deviceId}/revoke:
    post:
      tags:
      - Devices
      summary: Revoke device and sessions
      operationId: post_devices_deviceId_revoke
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      parameters:
      - name: deviceId
        in: path
        required: true
        schema:
          type: string
          format: uuid
  /recovery/status:
    get:
      tags:
      - Recovery
      summary: Check recovery kit status without disclosing secret
      operationId: get_recovery_status
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
  /attachments/upload-intent:
    post:
      tags:
      - Attachments
      summary: Request short-lived encrypted-object upload URL
      operationId: post_attachments_upload-intent
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
  /attachments/{attachmentId}/download-intent:
    post:
      tags:
      - Attachments
      summary: Request short-lived ciphertext download URL
      operationId: post_attachments_attachmentId_download-intent
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '400':
          description: Invalid request
        '401':
          description: Unauthenticated
        '403':
          description: Forbidden
        '409':
          description: Revision conflict
        '429':
          description: Rate limited
      parameters:
      - name: attachmentId
        in: path
        required: true
        schema:
          type: string
          format: uuid
```
