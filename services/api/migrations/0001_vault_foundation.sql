-- PostgreSQL 16 foundation for the v2 API. Authentication is deliberately not
-- implemented by this migration; user rows are provisioned by a future auth module.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ksv_app') THEN
    CREATE ROLE ksv_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ksv_auth') THEN
    CREATE ROLE ksv_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ksv_worker') THEN
    CREATE ROLE ksv_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE ksv_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE ksv_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE ksv_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE SCHEMA IF NOT EXISTS ksv AUTHORIZATION CURRENT_USER;
REVOKE ALL ON SCHEMA ksv FROM PUBLIC;
GRANT USAGE ON SCHEMA ksv TO ksv_app;

CREATE OR REPLACE FUNCTION ksv.app_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
REVOKE ALL ON FUNCTION ksv.app_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ksv.app_user_id() TO ksv_app;

CREATE TABLE ksv.users (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ksv.vaults (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ksv.users(id) ON DELETE CASCADE,
  wrapped_vault_key bytea NOT NULL,
  key_version integer NOT NULL DEFAULT 1 CHECK (key_version > 0),
  change_seq bigint NOT NULL DEFAULT 0 CHECK (change_seq >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, user_id)
);

CREATE TABLE ksv.vault_items (
  id uuid PRIMARY KEY,
  vault_id uuid NOT NULL,
  user_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  change_seq bigint NOT NULL DEFAULT 0 CHECK (change_seq >= 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  aad_version integer NOT NULL CHECK (aad_version > 0),
  key_version integer NOT NULL CHECK (key_version > 0),
  wrapped_item_key bytea NOT NULL CHECK (octet_length(wrapped_item_key) = 72),
  nonce bytea NOT NULL CHECK (octet_length(nonce) = 24),
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) BETWEEN 17 AND 262160),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vault_id, user_id) REFERENCES ksv.vaults(id, user_id) ON DELETE CASCADE,
  UNIQUE (vault_id, change_seq) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX vault_items_changes_idx ON ksv.vault_items(vault_id, change_seq);

CREATE TABLE ksv.idempotency_keys (
  user_id uuid NOT NULL REFERENCES ksv.users(id) ON DELETE CASCADE,
  operation_id text NOT NULL CHECK (char_length(operation_id) BETWEEN 1 AND 80),
  key text NOT NULL CHECK (key ~ '^[A-Za-z0-9._~-]{16,128}$'),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  state text NOT NULL CHECK (state IN ('in_progress', 'completed')),
  response_status smallint,
  response_ref jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id, key),
  CHECK ((state = 'in_progress' AND response_status IS NULL AND response_ref IS NULL)
      OR (state = 'completed' AND response_status IS NOT NULL
          AND response_status BETWEEN 200 AND 299 AND response_ref IS NOT NULL)),
  CHECK (response_ref IS NULL OR jsonb_typeof(response_ref) = 'object')
);

CREATE OR REPLACE FUNCTION ksv.next_change_seq(p_vault_id uuid, p_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
AS $function$
DECLARE
  next_value bigint;
BEGIN
  UPDATE ksv.vaults
     SET change_seq = change_seq + 1
   WHERE id = p_vault_id AND user_id = p_user_id
   RETURNING change_seq INTO next_value;

  IF next_value IS NULL THEN
    RAISE EXCEPTION 'vault is unavailable' USING ERRCODE = '23503';
  END IF;
  RETURN next_value;
END
$function$;
REVOKE ALL ON FUNCTION ksv.next_change_seq(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ksv.next_change_seq(uuid, uuid) TO ksv_app;

CREATE OR REPLACE FUNCTION ksv.vault_item_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.change_seq := ksv.next_change_seq(NEW.vault_id, NEW.user_id);
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
  ELSE
    NEW.revision := OLD.revision + 1;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION ksv.vault_item_before_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ksv.vault_item_before_write() TO ksv_app;

CREATE TRIGGER vault_items_before_write
BEFORE INSERT OR UPDATE ON ksv.vault_items
FOR EACH ROW EXECUTE FUNCTION ksv.vault_item_before_write();

ALTER TABLE ksv.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ksv.users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_self ON ksv.users FOR SELECT TO ksv_app
  USING (id = ksv.app_user_id());

ALTER TABLE ksv.vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE ksv.vaults FORCE ROW LEVEL SECURITY;
CREATE POLICY vaults_owner ON ksv.vaults FOR ALL TO ksv_app
  USING (user_id = ksv.app_user_id())
  WITH CHECK (user_id = ksv.app_user_id());

ALTER TABLE ksv.vault_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ksv.vault_items FORCE ROW LEVEL SECURITY;
CREATE POLICY vault_items_owner ON ksv.vault_items FOR ALL TO ksv_app
  USING (user_id = ksv.app_user_id())
  WITH CHECK (user_id = ksv.app_user_id());

ALTER TABLE ksv.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ksv.idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_keys_owner ON ksv.idempotency_keys FOR ALL TO ksv_app
  USING (user_id = ksv.app_user_id())
  WITH CHECK (user_id = ksv.app_user_id());

GRANT SELECT ON ksv.users TO ksv_app;
GRANT SELECT, INSERT ON ksv.vaults TO ksv_app;
GRANT UPDATE (change_seq) ON ksv.vaults TO ksv_app;
GRANT SELECT, INSERT ON ksv.vault_items TO ksv_app;
GRANT UPDATE (schema_version, aad_version, key_version, wrapped_item_key, nonce, ciphertext, deleted_at)
  ON ksv.vault_items TO ksv_app;
GRANT SELECT, INSERT ON ksv.idempotency_keys TO ksv_app;
GRANT UPDATE (state, response_status, response_ref) ON ksv.idempotency_keys TO ksv_app;
