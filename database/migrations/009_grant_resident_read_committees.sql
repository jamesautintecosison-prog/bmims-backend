-- =====================================================================
-- 009_grant_resident_read_committees.sql
-- BMIMS: residents may read committee names
-- Found while building the service-request screen: a resident must be able
-- to choose which committee handles a request. The committees table holds
-- only names and descriptions, so read access is safe.
-- No RLS is needed on committees.
-- Depends on: 001-008
-- =====================================================================

BEGIN;

GRANT SELECT ON committees TO resident_role;

COMMIT;
