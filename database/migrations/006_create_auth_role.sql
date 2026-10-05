-- =====================================================================
-- 006_create_auth_role.sql
-- BMIMS: dedicated login-lookup role
-- auth_role can ONLY read the users table. The API uses it to verify a
-- username/password before a caller is authenticated; it is never used
-- for anything a signed-in user does.
-- NO PASSWORD IN THIS FILE: set it in the Neon console (Reset password).
-- Depends on: 001-005
-- =====================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_role') THEN
        CREATE ROLE auth_role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM auth_role;
GRANT USAGE ON SCHEMA public TO auth_role;
GRANT SELECT ON users TO auth_role;

COMMIT;
