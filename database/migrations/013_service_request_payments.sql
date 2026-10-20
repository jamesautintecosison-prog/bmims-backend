BEGIN;

CREATE TABLE service_request_payments (
    payment_record_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id INT NOT NULL
        REFERENCES service_requests (request_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    payment_method VARCHAR(20) NOT NULL
        CHECK (payment_method IN ('online', 'face_to_face')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
    payment_status VARCHAR(20) NOT NULL
        CHECK (payment_status IN ('Pending Payment', 'Paid', 'Payment Failed', 'Refund Pending', 'Refunded')),
    refund_status VARCHAR(20) NOT NULL DEFAULT 'Not Requested'
        CHECK (refund_status IN ('Not Requested', 'Pending', 'Succeeded', 'Failed')),
    checkout_session_id VARCHAR(100) UNIQUE,
    checkout_url TEXT,
    payment_reference VARCHAR(100) UNIQUE,
    refund_reference VARCHAR(100) UNIQUE,
    refund_external_reference VARCHAR(100),
    created_by_user_id INT REFERENCES users (user_id) ON DELETE SET NULL,
    confirmed_by_user_id INT REFERENCES users (user_id) ON DELETE SET NULL,
    refund_confirmed_by_user_id INT REFERENCES users (user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ
);

CREATE INDEX idx_service_request_payments_request
    ON service_request_payments (request_id, created_at DESC);
CREATE UNIQUE INDEX uq_service_request_current_payment
    ON service_request_payments (request_id)
    WHERE payment_status IN ('Pending Payment', 'Paid', 'Refund Pending', 'Refunded');

CREATE TABLE service_request_payment_events (
    payment_event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_record_id INT NOT NULL
        REFERENCES service_request_payments (payment_record_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    payment_status VARCHAR(20) NOT NULL
        CHECK (payment_status IN ('Pending Payment', 'Paid', 'Payment Failed', 'Refund Pending', 'Refunded')),
    reference VARCHAR(100),
    notes TEXT,
    actor_user_id INT REFERENCES users (user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_request_payment_events_payment
    ON service_request_payment_events (payment_record_id, created_at);
CREATE UNIQUE INDEX uq_service_request_payment_event_reference
    ON service_request_payment_events (payment_record_id, event_type, reference)
    WHERE reference IS NOT NULL;

ALTER TABLE service_request_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all ON service_request_payments
    FOR ALL TO admin_role USING (true) WITH CHECK (true);
CREATE POLICY admin_all ON service_request_payment_events
    FOR ALL TO admin_role USING (true) WITH CHECK (true);

CREATE POLICY staff_committee ON service_request_payments
    FOR ALL TO staff_role
    USING (request_id IN (SELECT request_id FROM service_requests))
    WITH CHECK (request_id IN (SELECT request_id FROM service_requests));
CREATE POLICY staff_committee ON service_request_payment_events
    FOR ALL TO staff_role
    USING (payment_record_id IN (SELECT payment_record_id FROM service_request_payments))
    WITH CHECK (payment_record_id IN (SELECT payment_record_id FROM service_request_payments));

CREATE POLICY resident_own_read ON service_request_payments
    FOR SELECT TO resident_role
    USING (request_id IN (SELECT request_id FROM service_requests));
CREATE POLICY resident_own_insert ON service_request_payments
    FOR INSERT TO resident_role
    WITH CHECK (
        payment_status IN ('Pending Payment', 'Paid')
        AND request_id IN (
            SELECT sr.request_id
            FROM service_requests AS sr
            JOIN document_types AS dt ON dt.doc_type_id = sr.doc_type_id
            WHERE dt.fee_amount = service_request_payments.amount
        )
    );
CREATE POLICY resident_own_read ON service_request_payment_events
    FOR SELECT TO resident_role
    USING (payment_record_id IN (SELECT payment_record_id FROM service_request_payments));
CREATE POLICY resident_own_insert ON service_request_payment_events
    FOR INSERT TO resident_role
    WITH CHECK (
        payment_record_id IN (SELECT payment_record_id FROM service_request_payments)
        AND event_type IN ('payment_method_selected', 'no_payment_required')
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON service_request_payments TO admin_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_request_payment_events TO admin_role;
GRANT USAGE, SELECT ON SEQUENCE service_request_payments_payment_record_id_seq TO admin_role;
GRANT USAGE, SELECT ON SEQUENCE service_request_payment_events_payment_event_id_seq TO admin_role;

GRANT SELECT, INSERT, UPDATE ON service_request_payments TO staff_role;
GRANT SELECT, INSERT ON service_request_payment_events TO staff_role;
GRANT USAGE, SELECT ON SEQUENCE service_request_payments_payment_record_id_seq TO staff_role;
GRANT USAGE, SELECT ON SEQUENCE service_request_payment_events_payment_event_id_seq TO staff_role;

GRANT SELECT ON service_request_payments TO resident_role;
GRANT INSERT (request_id, payment_method, amount, currency, payment_status, created_by_user_id, paid_at)
    ON service_request_payments TO resident_role;
GRANT SELECT ON service_request_payment_events TO resident_role;
GRANT INSERT (payment_record_id, event_type, payment_status, reference, notes, actor_user_id)
    ON service_request_payment_events TO resident_role;
GRANT USAGE, SELECT ON SEQUENCE service_requests_request_id_seq TO resident_role;
GRANT USAGE, SELECT ON SEQUENCE service_request_payments_payment_record_id_seq TO resident_role;
GRANT USAGE, SELECT ON SEQUENCE service_request_payment_events_payment_event_id_seq TO resident_role;

COMMIT;
