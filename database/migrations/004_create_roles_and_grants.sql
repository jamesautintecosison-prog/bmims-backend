-- =====================================================================
-- 004_create_roles_and_grants.sql
-- BMIMS: least-privilege database roles, one per user tier
-- Roles: admin_role, staff_role, resident_role
-- Depends on: 001, 002, 003
--
-- NO PASSWORDS IN THIS FILE. After running it, set each password by hand
-- (see the ALTER ROLE commands in the README / chat) and store the
-- connection strings only in your local .env.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Create the roles (idempotent)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
        CREATE ROLE admin_role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staff_role') THEN
        CREATE ROLE staff_role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resident_role') THEN
        CREATE ROLE resident_role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 2. Start from zero: no access to anything by default
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM admin_role, staff_role, resident_role;
GRANT USAGE ON SCHEMA public TO admin_role, staff_role, resident_role;

-- ---------------------------------------------------------------------
-- 3. admin_role: full CRUD on business tables, read-only on audit_logs
--    (audit rows are written by triggers, never by the application)
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
    households, residents, staff, users, committees,
    staff_committee_assignments, document_types, service_requests,
    incident_reports, incident_participants, health_programs,
    resident_program_enrollment, committee_budgets, expense_logs
TO admin_role;

GRANT SELECT ON audit_logs TO admin_role;

-- ---------------------------------------------------------------------
-- 4. staff_role: committee work, no deletes, no account management
-- ---------------------------------------------------------------------
GRANT SELECT ON
    households, residents, staff, committees, staff_committee_assignments,
    document_types, health_programs, committee_budgets
TO staff_role;

GRANT SELECT, INSERT, UPDATE ON
    service_requests, incident_reports, incident_participants,
    resident_program_enrollment
TO staff_role;

GRANT SELECT, INSERT ON expense_logs TO staff_role;

-- ---------------------------------------------------------------------
-- 5. resident_role: submit requests/reports and read reference data
--    (row-level restriction to the resident's own rows is added in the
--     next migration with views / row-level security)
-- ---------------------------------------------------------------------
GRANT SELECT ON document_types, health_programs TO resident_role;

GRANT SELECT, INSERT ON
    service_requests, incident_reports, incident_participants
TO resident_role;

GRANT SELECT ON residents, households, resident_program_enrollment
TO resident_role;

COMMIT;
