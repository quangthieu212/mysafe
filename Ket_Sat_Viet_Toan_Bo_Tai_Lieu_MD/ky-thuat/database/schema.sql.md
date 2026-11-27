# Cấu trúc PostgreSQL

> Đây là bản trình bày Markdown của tệp `database/schema.sql`. Để chạy bằng công cụ chuyên dụng, trích nội dung trong khối mã ra đúng định dạng gốc.

```sql
-- PostgreSQL 16; ciphertext only; use migrations in production
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email_normalized text NOT NULL UNIQUE, auth_verifier text NOT NULL, kdf_params jsonb NOT NULL, encrypted_root_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), disabled_at timestamptz);
CREATE TABLE devices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), name text NOT NULL, public_key text NOT NULL, status text NOT NULL CHECK(status IN ('pending','active','revoked')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id));
CREATE TABLE vaults(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), encrypted_name text, revision bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE vault_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vault_id uuid NOT NULL REFERENCES vaults(id), revision bigint NOT NULL DEFAULT 1, schema_version int NOT NULL, ciphertext text NOT NULL, nonce text NOT NULL, aad_version int NOT NULL, deleted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), CHECK(revision>0));
CREATE INDEX ix_items_vault_revision ON vault_items(vault_id,revision);
CREATE TABLE item_revisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES vault_items(id), revision bigint NOT NULL, ciphertext text NOT NULL, nonce text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(item_id,revision));
CREATE TABLE attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES vault_items(id), storage_key text NOT NULL UNIQUE, encrypted_metadata text NOT NULL, ciphertext_sha256 text NOT NULL, byte_size bigint NOT NULL CHECK(byte_size>=0), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE device_key_wraps(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vault_id uuid NOT NULL REFERENCES vaults(id), device_id uuid NOT NULL REFERENCES devices(id), wrapped_key text NOT NULL, wrap_version int NOT NULL, UNIQUE(vault_id,device_id));
CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), device_id uuid NOT NULL REFERENCES devices(id), refresh_token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE TABLE recovery_kits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), encrypted_root_key text NOT NULL, recovery_version int NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), event_type text NOT NULL, device_id uuid, occurred_at timestamptz NOT NULL DEFAULT now(), ip_hash text, details jsonb NOT NULL DEFAULT '{}'::jsonb);
-- RLS or explicit user_id ownership checks required for every API query; no plaintext metadata in audit.
```
