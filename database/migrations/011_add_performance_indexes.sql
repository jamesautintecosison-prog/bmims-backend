-- =====================================================================
-- 011_add_performance_indexes.sql
-- BMIMS: indexes chosen from EXPLAIN (ANALYZE, BUFFERS) results measured
-- on 30,000 residents, 150,000 service requests, 40,000 incidents.
-- Depends on: 001-010
--
--  Q1 staff work queue          service_requests (committee_id, status, date_requested)
--  Q5 counts per status         same index (index-only scan after VACUUM)
--  Q6 pending across committees service_requests (status, date_requested)
--  Q2 incidents by date         incident_reports (date_filed)
--  Q3 resident by last name     residents (last_name, first_name)
--
-- idx_requests_committee (committee_id alone) is replaced: the new composite
-- index starts with the same column, so it serves every query the old one
-- did, and one fewer index means cheaper inserts and updates.
-- =====================================================================

BEGIN;

CREATE INDEX idx_requests_committee_status_date
    ON service_requests (committee_id, status, date_requested);

CREATE INDEX idx_requests_status_date
    ON service_requests (status, date_requested);

DROP INDEX IF EXISTS idx_requests_committee;

CREATE INDEX idx_incidents_date_filed
    ON incident_reports (date_filed);

CREATE INDEX idx_residents_last_first_name
    ON residents (last_name, first_name);

COMMIT;
