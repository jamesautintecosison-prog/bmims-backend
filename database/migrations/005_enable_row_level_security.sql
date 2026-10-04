-- =====================================================================
-- 005_enable_row_level_security.sql
-- BMIMS: row-level data isolation enforced inside the database
--
-- How it works: on every request the API opens a transaction and runs
--     SELECT set_config('app.resident_id', '<id or empty>', true);
--     SELECT set_config('app.staff_id',    '<id or empty>', true);
-- The policies below read those two values. The table owner (used only
-- for migrations) bypasses RLS; the three app roles never do.
-- Depends on: 001-004
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Helper functions: who is making this request?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_resident_id() RETURNS INT
LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.resident_id', true), '')::INT $$;

CREATE OR REPLACE FUNCTION app_staff_id() RETURNS INT
LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.staff_id', true), '')::INT $$;

-- Committees the current staff member is assigned to
CREATE OR REPLACE FUNCTION app_committee_ids() RETURNS SETOF INT
LANGUAGE sql STABLE AS
$$ SELECT committee_id
     FROM staff_committee_assignments
    WHERE staff_id = app_staff_id() $$;

-- ---------------------------------------------------------------------
-- Turn RLS on
-- ---------------------------------------------------------------------
ALTER TABLE residents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE households                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE resident_program_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_budgets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_logs                ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- admin_role: sees and changes everything
-- ---------------------------------------------------------------------
CREATE POLICY admin_all ON residents                   FOR ALL TO admin_role USING (true) WITH CHECK (true);
CREATE POLICY admin_all ON households                  FOR ALL TO admin_role USING (true) WITH CHECK (true);
CREATE POLICY admin_all ON service_requests            FOR ALL TO admin_role USING (true) WITH CHECK (true);
CREATE POLICY admin_all ON incident_reports            FOR ALL TO admin_role USING (true) WITH CHECK (true);
CREATE POLICY admin_all ON incident_participants       FOR ALL TO admin_role USING (true) WITH CHECK (true);
CREATE POLICY admin_all ON resident_program_enrollment FOR ALL TO admin_role USING (true) WITH CHECK (true);
CREATE POLICY admin_all ON committee_budgets           FOR ALL TO admin_role USING (true) WITH CHECK (true);
CREATE POLICY admin_all ON expense_logs                FOR ALL TO admin_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------
-- staff_role: residents/households readable; everything else limited to
-- the staff member's own committees
-- ---------------------------------------------------------------------
CREATE POLICY staff_read ON residents  FOR SELECT TO staff_role USING (true);
CREATE POLICY staff_read ON households FOR SELECT TO staff_role USING (true);

CREATE POLICY staff_committee ON service_requests
    FOR ALL TO staff_role
    USING      (committee_id IN (SELECT app_committee_ids()))
    WITH CHECK (committee_id IN (SELECT app_committee_ids()));

CREATE POLICY staff_committee ON incident_reports
    FOR ALL TO staff_role
    USING      (committee_id IN (SELECT app_committee_ids()))
    WITH CHECK (committee_id IN (SELECT app_committee_ids()));

-- participants follow the incident: visible only if the incident is
CREATE POLICY staff_committee ON incident_participants
    FOR ALL TO staff_role
    USING      (incident_id IN (SELECT incident_id FROM incident_reports))
    WITH CHECK (incident_id IN (SELECT incident_id FROM incident_reports));

CREATE POLICY staff_committee ON resident_program_enrollment
    FOR ALL TO staff_role
    USING (program_id IN (
        SELECT program_id FROM health_programs
         WHERE committee_id IN (SELECT app_committee_ids())))
    WITH CHECK (program_id IN (
        SELECT program_id FROM health_programs
         WHERE committee_id IN (SELECT app_committee_ids())));

CREATE POLICY staff_committee ON committee_budgets
    FOR SELECT TO staff_role
    USING (committee_id IN (SELECT app_committee_ids()));

CREATE POLICY staff_committee_read ON expense_logs
    FOR SELECT TO staff_role
    USING (budget_id IN (SELECT budget_id FROM committee_budgets));

CREATE POLICY staff_committee_insert ON expense_logs
    FOR INSERT TO staff_role
    WITH CHECK (budget_id IN (SELECT budget_id FROM committee_budgets));

-- ---------------------------------------------------------------------
-- resident_role: only their own household and records
-- ---------------------------------------------------------------------
CREATE POLICY resident_self ON residents
    FOR SELECT TO resident_role
    USING (resident_id = app_resident_id());

CREATE POLICY resident_own_household ON households
    FOR SELECT TO resident_role
    USING (household_id = (SELECT household_id FROM residents
                            WHERE resident_id = app_resident_id()));

CREATE POLICY resident_own_read ON service_requests
    FOR SELECT TO resident_role
    USING (resident_id = app_resident_id());

CREATE POLICY resident_own_insert ON service_requests
    FOR INSERT TO resident_role
    WITH CHECK (resident_id = app_resident_id()
                AND status = 'Pending'
                AND reference_number IS NULL);

CREATE POLICY resident_own_enrollment ON resident_program_enrollment
    FOR SELECT TO resident_role
    USING (resident_id = app_resident_id());

-- Incidents: a resident sees only incidents they are a party to.
CREATE POLICY resident_own_participation ON incident_participants
    FOR SELECT TO resident_role
    USING (resident_id = app_resident_id());

CREATE POLICY resident_party_read ON incident_reports
    FOR SELECT TO resident_role
    USING (incident_id IN (SELECT incident_id FROM incident_participants));

-- Filing goes through sp_file_incident_report (written in the routines
-- migration). Until then residents may insert; that direct INSERT grant
-- is revoked once the procedure exists.
CREATE POLICY resident_file_incident ON incident_reports
    FOR INSERT TO resident_role WITH CHECK (true);
CREATE POLICY resident_file_participant ON incident_participants
    FOR INSERT TO resident_role WITH CHECK (true);

COMMIT;
