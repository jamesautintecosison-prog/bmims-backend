-- =====================================================================
-- 008_create_stored_procedures.sql
-- BMIMS: server-side business workflows
--   sp_issue_certificate(request_id)  -> text reference number
--   sp_file_incident_report(...)      -> new incident_id
-- Depends on: 001-007
--
-- Both are PostgreSQL functions, so each call runs as ONE atomic unit:
-- any error rolls back everything the function did (the equivalent of
-- START TRANSACTION ... COMMIT/ROLLBACK). They are SECURITY DEFINER so they
-- can see the whole table (e.g. to number references correctly), which means
-- they do their OWN authorization checks. The caller is identified from the
-- session values the API sets per request (app.staff_id / app.resident_id),
-- never from a parameter a caller could fake.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- sp_issue_certificate
-- 1. only staff may call it
-- 2. the request must exist (row is locked for the rest of the transaction)
-- 3. staff must belong to the request's committee (or be an admin account)
-- 4. the request must still be open
-- 5. the resident must be Active
-- 6. next sequential reference number: BRGY-<year>-<0001..>
-- 7. mark Released; the audit trigger records the change and the actor
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_issue_certificate(p_request_id INT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_staff  INT  := app_staff_id();
    v_req    service_requests%ROWTYPE;
    v_status TEXT;
    v_year   TEXT := to_char(now(), 'YYYY');
    v_next   INT;
    v_ref    TEXT;
BEGIN
    IF v_staff IS NULL THEN
        RAISE EXCEPTION 'Only staff can issue certificates';
    END IF;

    SELECT * INTO v_req
      FROM service_requests
     WHERE request_id = p_request_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Service request % does not exist', p_request_id;
    END IF;

    IF NOT (
        EXISTS (SELECT 1 FROM staff_committee_assignments
                 WHERE staff_id = v_staff AND committee_id = v_req.committee_id)
        OR EXISTS (SELECT 1 FROM users WHERE staff_id = v_staff AND role = 'admin')
    ) THEN
        RAISE EXCEPTION 'Staff % is not assigned to the committee that handles request %',
            v_staff, p_request_id;
    END IF;

    IF v_req.status NOT IN ('Pending', 'Processing', 'Approved') THEN
        RAISE EXCEPTION 'Request % cannot be issued: its status is %',
            p_request_id, v_req.status;
    END IF;

    SELECT resident_status INTO v_status
      FROM residents
     WHERE resident_id = v_req.resident_id;
    IF v_status IS DISTINCT FROM 'Active' THEN
        RAISE EXCEPTION 'Resident is not eligible: status is %', v_status;
    END IF;

    -- One issuer at a time, so two certificates can never get the same number
    PERFORM pg_advisory_xact_lock(hashtext('sp_issue_certificate'));

    SELECT COALESCE(MAX(substring(reference_number FROM '[0-9]+$')::INT), 0) + 1
      INTO v_next
      FROM service_requests
     WHERE reference_number LIKE 'BRGY-' || v_year || '-%';

    v_ref := 'BRGY-' || v_year || '-' || lpad(v_next::TEXT, 4, '0');

    UPDATE service_requests
       SET status             = 'Released',
           reference_number   = v_ref,
           issued_by_staff_id = v_staff,
           date_released      = now()
     WHERE request_id = p_request_id;

    RETURN v_ref;
END;
$$;

-- ---------------------------------------------------------------------
-- sp_file_incident_report
-- participants is a JSON array, for example:
--   [{"resident_id":1,"participant_role":"complainant","statement":"..."},
--    {"resident_id":3,"participant_role":"respondent"}]
-- The incident row and ALL participant rows are created together, or not
-- at all.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_file_incident_report(
    p_committee_id  INT,
    p_location      TEXT,
    p_description   TEXT,
    p_participants  JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_staff    INT := app_staff_id();
    v_resident INT := app_resident_id();
    v_incident INT;
BEGIN
    IF v_staff IS NULL AND v_resident IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_location IS NULL OR btrim(p_location) = ''
       OR p_description IS NULL OR btrim(p_description) = '' THEN
        RAISE EXCEPTION 'Location and description are required';
    END IF;

    IF jsonb_typeof(p_participants) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_participants) = 0 THEN
        RAISE EXCEPTION 'At least one participant is required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM jsonb_to_recordset(p_participants)
               AS p(resident_id INT, participant_role TEXT, statement TEXT)
         WHERE p.participant_role = 'complainant'
    ) THEN
        RAISE EXCEPTION 'An incident needs at least one complainant';
    END IF;

    IF v_staff IS NOT NULL THEN
        -- Staff may only file for their own committees (admins for any)
        IF NOT (
            EXISTS (SELECT 1 FROM staff_committee_assignments
                     WHERE staff_id = v_staff AND committee_id = p_committee_id)
            OR EXISTS (SELECT 1 FROM users WHERE staff_id = v_staff AND role = 'admin')
        ) THEN
            RAISE EXCEPTION 'Staff % is not assigned to committee %', v_staff, p_committee_id;
        END IF;
    ELSE
        -- A resident can only file as a complainant themselves
        IF NOT EXISTS (
            SELECT 1
              FROM jsonb_to_recordset(p_participants)
                   AS p(resident_id INT, participant_role TEXT, statement TEXT)
             WHERE p.participant_role = 'complainant'
               AND p.resident_id = v_resident
        ) THEN
            RAISE EXCEPTION 'A resident can only file an incident as a complainant';
        END IF;
    END IF;

    INSERT INTO incident_reports (committee_id, handled_by_staff_id, location, description)
    VALUES (p_committee_id, v_staff, btrim(p_location), btrim(p_description))
    RETURNING incident_id INTO v_incident;

    INSERT INTO incident_participants (incident_id, resident_id, participant_role, statement)
    SELECT v_incident, p.resident_id, p.participant_role, NULLIF(btrim(p.statement), '')
      FROM jsonb_to_recordset(p_participants)
           AS p(resident_id INT, participant_role TEXT, statement TEXT);

    RETURN v_incident;
END;
$$;

-- ---------------------------------------------------------------------
-- Who may call them
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION sp_issue_certificate(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_issue_certificate(INT) TO admin_role, staff_role;

REVOKE ALL ON FUNCTION sp_file_incident_report(INT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sp_file_incident_report(INT, TEXT, TEXT, JSONB)
    TO admin_role, staff_role, resident_role;

-- Incidents now go through the procedure only (one atomic path), so the
-- direct-insert shortcuts from migrations 004/005 are removed.
REVOKE INSERT ON incident_reports, incident_participants FROM resident_role;
REVOKE INSERT ON incident_reports, incident_participants FROM staff_role;
DROP POLICY IF EXISTS resident_file_incident    ON incident_reports;
DROP POLICY IF EXISTS resident_file_participant ON incident_participants;

COMMIT;
