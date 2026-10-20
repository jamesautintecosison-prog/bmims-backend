BEGIN;

ALTER TABLE service_requests
    ADD COLUMN cancelled_at TIMESTAMPTZ;

ALTER TABLE service_requests
    DROP CONSTRAINT IF EXISTS service_requests_status_check;

ALTER TABLE service_requests
    ADD CONSTRAINT chk_service_requests_status
    CHECK (status IN ('Pending', 'Processing', 'Approved', 'Released', 'Rejected', 'Cancelled'));

COMMIT;
