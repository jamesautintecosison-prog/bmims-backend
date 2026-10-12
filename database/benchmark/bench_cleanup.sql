-- =====================================================================
-- bench_cleanup.sql
-- Removes ALL benchmark rows created by bench_generate.sql.
-- The audit triggers are switched off for this one transaction, otherwise
-- deleting ~220,000 rows would write ~220,000 audit rows. Run as the owner.
-- =====================================================================

BEGIN;

ALTER TABLE service_requests DISABLE TRIGGER trg_audit_service_requests;
ALTER TABLE incident_reports DISABLE TRIGGER trg_audit_incident_reports;
ALTER TABLE residents        DISABLE TRIGGER trg_audit_residents;

DELETE FROM service_requests
 WHERE resident_id IN (SELECT resident_id FROM residents WHERE first_name LIKE 'Bench%');

DELETE FROM incident_reports WHERE description LIKE 'bench test incident%';

DELETE FROM residents WHERE first_name LIKE 'Bench%';

ALTER TABLE service_requests ENABLE TRIGGER trg_audit_service_requests;
ALTER TABLE incident_reports ENABLE TRIGGER trg_audit_incident_reports;
ALTER TABLE residents        ENABLE TRIGGER trg_audit_residents;

COMMIT;

ANALYZE residents;
ANALYZE service_requests;
ANALYZE incident_reports;

-- Expect 0 for all three, and the three triggers listed as enabled ('O')
SELECT (SELECT count(*) FROM residents WHERE first_name LIKE 'Bench%')                    AS bench_residents,
       (SELECT count(*) FROM incident_reports WHERE description LIKE 'bench test incident%') AS bench_incidents;

SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgname IN ('trg_audit_residents', 'trg_audit_service_requests', 'trg_audit_incident_reports');
