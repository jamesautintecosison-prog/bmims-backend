# BMIMS Query Benchmark Report

**Migration under test:** `011_add_performance_indexes.sql`
**Database:** PostgreSQL 18 on Neon (free tier, Singapore region)
**Method:** `EXPLAIN (ANALYZE, BUFFERS)` run in Neon's SQL Editor as the table owner
**Scripts:** `database/benchmark/` (`bench_generate.sql`, `bench_queries.sql`, `bench_cleanup.sql`)

## 1. Test data

The seed data has only a handful of rows, which makes every query instant. To make index behavior visible, `bench_generate.sql` loaded:

| Table | Rows |
|---|---|
| residents | 30,000 (500 distinct last names, about 60 residents each) |
| service_requests | 150,000 (4 statuses, 3 committees, spread over 2 years) |
| incident_reports | 40,000 (spread over 2 years) |

`ANALYZE` was run after loading so the planner had current statistics. All benchmark rows are removed by `bench_cleanup.sql`, which disables the audit triggers for that one transaction so that deleting about 220,000 rows does not write 220,000 audit rows.

## 2. Queries

| ID | Purpose | Query (abbreviated) |
|---|---|---|
| Q1 | Staff work queue | `service_requests WHERE committee_id = 2 AND status = 'Pending' ORDER BY date_requested LIMIT 50` |
| Q2 | Incidents in the last 30 days | `count(*) FROM incident_reports WHERE date_filed >= now() - interval '30 days'` |
| Q3 | Find a resident by last name | `residents WHERE last_name = 'Surname42'` |
| Q4 | Requests of one resident (control) | `service_requests WHERE resident_id = <one resident>` |
| Q5 | Request counts per status for one committee | `SELECT status, count(*) ... WHERE committee_id = 1 GROUP BY status` |
| Q6 | Oldest pending requests across all committees | `service_requests WHERE status = 'Pending' ORDER BY date_requested LIMIT 50` |

## 3. Indexes added (migration 011)

| Index | Table (columns) | Serves |
|---|---|---|
| `idx_requests_committee_status_date` | service_requests (committee_id, status, date_requested) | Q1, Q5 |
| `idx_requests_status_date` | service_requests (status, date_requested) | Q6 |
| `idx_incidents_date_filed` | incident_reports (date_filed) | Q2 |
| `idx_residents_last_first_name` | residents (last_name, first_name) | Q3 |

`idx_requests_committee` (committee_id alone) was **dropped**: the new composite index starts with the same column, so it answers every query the old one did, and one fewer index means cheaper inserts and updates.

Existing before this migration and unchanged: `idx_requests_resident` (used by Q4), plus the primary key and unique indexes.

## 4. Results

Execution time as reported by `EXPLAIN ANALYZE`. Planning time stayed between about 0.08 and 0.2 ms in every run.

| Query | Before | After | Speed-up |
|---|---|---|---|
| Q1 work queue | Bitmap Index Scan on `idx_requests_committee`, Bitmap Heap Scan, Sort, Limit: **7.99 ms** | Limit over an index scan, no Sort: **0.209 ms** | about 38x |
| Q2 incidents, last 30 days | Seq Scan: **6.91 ms** | Aggregate over an index-based scan: **0.323 ms** | about 21x |
| Q3 resident by last name | Seq Scan: **1.77 ms** | Bitmap Heap Scan via `idx_residents_last_first_name`: **0.129 ms** | about 14x |
| Q4 requests of one resident (control) | Index Scan on `idx_requests_resident`: **0.163 ms** | Index Scan, unchanged: **0.095 ms** | none expected |
| Q5 counts per status | Bitmap Index Scan, HashAggregate: **16.4 ms** | GroupAggregate over the new index: **12.0 ms** | about 1.4x |
| Q6 pending, all committees | Seq Scan with Sort: **21.3 ms** | Limit over an Index Scan: **0.215 ms** | about 100x |

### Reading the results

- **Q1 and Q6 show the largest gain.** Both ask for "the oldest N rows that match". With an index ordered by `(committee_id, status, date_requested)` or `(status, date_requested)`, the database reads the first 50 index entries and stops. Without it, it had to fetch every matching row (about 50,000 for Q1) and sort them first. The gain grows with table size, because the indexed version always reads about 50 entries.
- **Q2 and Q3** changed from reading the whole table to reading only the matching range of the index. Q3's composite index also covers a lookup by last name plus first name.
- **Q4 is the control.** It already used an index, so it should not change; the small difference between 0.163 ms and 0.095 ms is run-to-run variation.
- **Q5 improved only slightly, and that is expected.** It counts every request of a committee (about 50,000 rows), so any plan must still read about 50,000 entries. The index lets the database read a smaller structure instead of the table, but cannot avoid the counting. If this report is needed often, the right fix is not another index but a stored summary (a materialized view or a per-status counter table).

## 5. Design decisions and trade-offs

- **Column order follows the query shape.** Equality columns come first (`committee_id`, then `status`), the sort column last (`date_requested`), so the index delivers rows already in order.
- **Fits the access-control policies.** The row-level-security policy for staff filters by `committee_id`, which is the leading column of the composite index, so staff queries benefit automatically.
- **Indexes are not free.** Every index slows inserts and updates slightly and uses storage. That is why only four were added, each tied to a measured query, and one redundant index was removed.
- **`VACUUM (ANALYZE)`** was run after creating the indexes so the planner had fresh statistics and a visibility map for index-only scans.
- **Foreign-key columns** (`resident_id`, `committee_id`, `budget_id`, `incident_id`, and others) already had lookup indexes from migrations 002 and 003, because PostgreSQL does not create them automatically.

## 6. Limitations

- These timings come from one small cloud instance on a free tier, run from the SQL Editor as the table owner. The API runs queries as restricted roles, which adds row-level-security conditions, so absolute times in the application will be somewhat higher. The plan shapes and relative gains are what this report demonstrates.
- Timings vary slightly between runs (cache state, shared cloud hardware).
- The test data is synthetic and evenly distributed; real data may skew toward some committees or statuses.

## 7. Appendix: raw plans

Paste the `Raw` tab output for each query, before and after, here (Neon SQL Editor, `Raw` tab next to `Plan`). Screenshots of the `Plan` tab may be attached instead.

- Q1 before / after
- Q2 before / after
- Q3 before / after
- Q4 before / after
- Q5 before / after
- Q6 before / after
