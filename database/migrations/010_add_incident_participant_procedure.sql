-- =====================================================================
-- 010_add_incident_participant_procedure.sql
-- BMIMS: add a person to an existing incident
--   sp_add_incident_participant(incident_id, resident_id, role, statement)
--     -> participant_id
-- Why: migration 008 removed direct inserts into incident_participants so
-- incidents are always filed atomically. Residents file as complainants;
-- staff still need a safe way to add the respondent and witnesses later.
-- Depends on: 001-009
--
-- SECURITY DEFINER with a pinned search_path. The caller is identified from
-- the session values the API sets (app.staff_id), never from a parameter.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION sp_add_incident_participant(
    p_incident_id INT,
    p_resident_id INT,
    p_role        TEXT,
    p_statement   TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_staff       INT := app_staff_id();
    v_incident    incident_reports%ROWTYPE;
    v_participant INT;
BEGIN
    IF v_staff IS NULL THEN
        RAISE EXCEPTION 'Only staff can add participants';
    END IF;

    SELECT * INTO v_incident
      FROM incident_reports
     WHERE incident_id = p_incident_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incident % does not exist', p_incident_id;
    END IF;

    IF NOT (
        EXISTS (SELECT 1 FROM staff_committee_assignments
                 WHERE staff_id = v_staff AND committee_id = v_incident.committee_id)
        OR EXISTS (SELECT 1 FROM users WHERE staff_id = v_staff AND role = 'admin')
    ) THEN
        RAISE EXCEPTION 'Staff % is not assigned to the committee of incident %',
            v_staff, p_incident_id;
    END IF;

    IF v_incident.status IN ('Settled', 'Closed') THEN
        RAISE EXCEPTION 'Incident % is already % and cannot take new participants',
            p_incident_id, v_incident.status;
    END IF;

    -- A bad role, an unknown resident or a duplicate is rejected by the
    -- table's CHECK / FOREIGN KEY / UNIQUE constraints and nothing is saved.
    INSERT INTO incident_participants (incident_id, resident_id, participant_role, statement)
    VALUES (p_incident_id, p_resident_id, p_role, NULLIF(btrim(p_statement), ''))
    RETURNING participant_id INTO v_participant;

    RETURN v_participant;
END;
$$;

REVOKE ALL ON FUNCTION sp_add_incident_participant(INT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_add_incident_participant(INT, INT, TEXT, TEXT)
    TO admin_role, staff_role;

COMMIT;
