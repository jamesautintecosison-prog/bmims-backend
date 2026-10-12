-- =====================================================================
-- bench_generate.sql
-- BMIMS benchmark data: enough rows for index differences to be visible.
-- Run ONCE as the owner in the Neon SQL Editor (click Run, not Explain).
--   30,000 residents   (first_name starts with 'Bench')
--  150,000 service requests (for those residents)
--   40,000 incidents  (description starts with 'bench test incident')
-- Everything is removable with bench_cleanup.sql.
-- =====================================================================

BEGIN;

INSERT INTO residents (first_name, last_name, birth_date, gender, contact_number, resident_status)
SELECT 'Bench' || g,
       'Surname' || (g % 500),
       DATE '1950-01-01' + (g % 20000),
       (ARRAY['Male', 'Female', 'Other'])[1 + (g % 3)],
       '0917' || lpad(g::TEXT, 7, '0'),
       'Active'
  FROM generate_series(1, 30000) AS g;

WITH ids AS (
    SELECT array_agg(resident_id ORDER BY resident_id) AS arr
      FROM residents
     WHERE first_name LIKE 'Bench%'
)
INSERT INTO service_requests
    (resident_id, doc_type_id, committee_id, issued_by_staff_id,
     status, reference_number, date_requested, date_released)
SELECT ids.arr[1 + (n % array_length(ids.arr, 1))],
       1 + (n % 4),
       1 + (n % 3),
       CASE WHEN s.st = 'Released' THEN 1 END,
       s.st,
       CASE WHEN s.st = 'Released' THEN 'BENCH-' || n END,
       s.ts,
       CASE WHEN s.st = 'Released' THEN s.ts + INTERVAL '2 days' END
  FROM ids,
       generate_series(1, 150000) AS n,
       LATERAL (
           SELECT (ARRAY['Pending', 'Processing', 'Approved', 'Released',
                         'Released', 'Released', 'Rejected'])[1 + (n % 7)] AS st,
                  now() - (n % 730) * INTERVAL '1 day'
                        - (n % 86400) * INTERVAL '1 second' AS ts
       ) AS s;

INSERT INTO incident_reports (committee_id, date_filed, location, description, status)
SELECT 1 + (n % 3),
       now() - (n % 730) * INTERVAL '1 day' - (n % 86400) * INTERVAL '1 second',
       'Purok ' || (1 + n % 10),
       'bench test incident ' || n,
       (ARRAY['Open', 'Under Investigation', 'Settled', 'Escalated', 'Closed'])[1 + (n % 5)]
  FROM generate_series(1, 40000) AS n;

COMMIT;

-- Fresh statistics so the planner sees the new data
ANALYZE residents;
ANALYZE service_requests;
ANALYZE incident_reports;

-- Quick check: expect 30000, 150000, 40000
SELECT (SELECT count(*) FROM residents WHERE first_name LIKE 'Bench%')                   AS bench_residents,
       (SELECT count(*) FROM service_requests WHERE reference_number LIKE 'BENCH-%')
         + (SELECT count(*) FROM service_requests sr JOIN residents r USING (resident_id)
             WHERE r.first_name LIKE 'Bench%' AND sr.reference_number IS NULL)             AS bench_requests,
       (SELECT count(*) FROM incident_reports WHERE description LIKE 'bench test incident%') AS bench_incidents;
