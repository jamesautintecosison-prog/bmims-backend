-- =====================================================================
-- 007_create_triggers.sql
-- BMIMS: server-side automation (triggers)
--   Trigger 1: expense_logs  -> keeps committee_budgets.remaining_amount
--              correct and rejects overspending
--   Trigger 2: residents / service_requests / incident_reports
--              -> every UPDATE and DELETE is written to audit_logs
-- Depends on: 001-006
--
-- Both functions are SECURITY DEFINER: they run with the owner's rights so
-- the app roles never need UPDATE on committee_budgets or INSERT on
-- audit_logs. search_path is pinned so the functions cannot be hijacked.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Trigger 1: budget deduction
--
-- Concurrency: the deduction is ONE atomic UPDATE with the balance check
-- inside its WHERE clause. The UPDATE locks the budget row, so two
-- expenses arriving at the same instant are applied one after the other,
-- and the second re-checks the balance after the first commits.
-- (The CHECK (remaining_amount >= 0) constraint is a second safety net.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_expense_adjust_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Give back the old amount when an expense is deleted or changed
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE committee_budgets
           SET remaining_amount = remaining_amount + OLD.amount
         WHERE budget_id = OLD.budget_id;
    END IF;

    -- Take the new amount, but only if enough balance remains
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE committee_budgets
           SET remaining_amount = remaining_amount - NEW.amount
         WHERE budget_id = NEW.budget_id
           AND remaining_amount >= NEW.amount;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Insufficient budget: expense of % exceeds the remaining balance of budget %',
                NEW.amount, NEW.budget_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_budget ON expense_logs;
CREATE TRIGGER trg_expense_budget
    AFTER INSERT OR DELETE OR UPDATE OF amount, budget_id ON expense_logs
    FOR EACH ROW EXECUTE FUNCTION fn_expense_adjust_budget();

-- ---------------------------------------------------------------------
-- Trigger 2: audit trail
--
-- One generic function; each trigger passes the table's primary-key column
-- name as its argument. The actor comes from app.user_id, which the API
-- sets on every request. It is NULL when someone edits the data directly
-- in a database client, which is itself useful evidence.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pk_column TEXT := TG_ARGV[0];
    v_actor     INT  := NULLIF(current_setting('app.user_id', true), '')::INT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Skip no-op updates
        IF to_jsonb(OLD) = to_jsonb(NEW) THEN
            RETURN NULL;
        END IF;
        INSERT INTO audit_logs
            (changed_by_user_id, table_name, record_id, action_type, old_value, new_value)
        VALUES
            (v_actor, TG_TABLE_NAME, (to_jsonb(OLD) ->> v_pk_column)::INT,
             'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs
            (changed_by_user_id, table_name, record_id, action_type, old_value, new_value)
        VALUES
            (v_actor, TG_TABLE_NAME, (to_jsonb(OLD) ->> v_pk_column)::INT,
             'DELETE', to_jsonb(OLD), NULL);
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_residents ON residents;
CREATE TRIGGER trg_audit_residents
    AFTER UPDATE OR DELETE ON residents
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('resident_id');

DROP TRIGGER IF EXISTS trg_audit_service_requests ON service_requests;
CREATE TRIGGER trg_audit_service_requests
    AFTER UPDATE OR DELETE ON service_requests
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('request_id');

DROP TRIGGER IF EXISTS trg_audit_incident_reports ON incident_reports;
CREATE TRIGGER trg_audit_incident_reports
    AFTER UPDATE OR DELETE ON incident_reports
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('incident_id');

COMMIT;
