-- =====================================================================
-- bench_queries.sql
-- The five queries to benchmark. Run EACH ONE SEPARATELY with the white
-- Run button (not Explain), then copy these numbers into the report:
--   * the main node type (Seq Scan / Index Scan / Bitmap ...)
--   * "Execution Time" and "Planning Time" at the bottom
--   * the "Buffers: shared hit/read" figure on the top line
-- Run each query 3 times and record the middle (second-fastest) result,
-- because the first run is slower while data loads into cache.
-- =====================================================================

-- Q1: staff work queue (open requests for one committee, oldest first)
EXPLAIN (ANALYZE, BUFFERS)
SELECT request_id, resident_id, date_requested
  FROM service_requests
 WHERE committee_id = 2 AND status = 'Pending'
 ORDER BY date_requested
 LIMIT 50;

-- Q2: incidents filed in the last 30 days
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
  FROM incident_reports
 WHERE date_filed >= now() - INTERVAL '30 days';

-- Q3: find a resident by last name
EXPLAIN (ANALYZE, BUFFERS)
SELECT resident_id, first_name, last_name
  FROM residents
 WHERE last_name = 'Surname42';

-- Q4: all requests of one resident (already covered by idx_requests_resident)
EXPLAIN (ANALYZE, BUFFERS)
SELECT request_id, status, date_requested
  FROM service_requests
 WHERE resident_id = (SELECT min(resident_id) + 15000 FROM residents WHERE first_name LIKE 'Bench%');

-- Q5: request counts per status for one committee (report-style)
EXPLAIN (ANALYZE, BUFFERS)
SELECT status, count(*)
  FROM service_requests
 WHERE committee_id = 1
 GROUP BY status;

-- Q6: oldest pending requests across ALL committees (admin overview)
EXPLAIN (ANALYZE, BUFFERS)
SELECT request_id, committee_id, date_requested
  FROM service_requests
 WHERE status = 'Pending'
 ORDER BY date_requested
 LIMIT 50;
