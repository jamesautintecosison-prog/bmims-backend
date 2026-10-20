BEGIN;

-- Prisma's PostgreSQL adapter uses table-level INSERT permission for these
-- writes. Restrict what the resident role may insert with the policies below.
GRANT INSERT ON service_request_payments TO resident_role;
GRANT INSERT ON service_request_payment_events TO resident_role;

DROP POLICY IF EXISTS resident_own_insert ON service_request_payments;
CREATE POLICY resident_own_insert ON service_request_payments
    FOR INSERT TO resident_role
    WITH CHECK (
        payment_method IN ('online', 'face_to_face')
        AND currency = 'PHP'
        AND refund_status = 'Not Requested'
        AND (
            (payment_status = 'Pending Payment' AND amount > 0 AND paid_at IS NULL)
            OR (payment_status = 'Paid' AND amount = 0 AND paid_at IS NOT NULL)
        )
        AND checkout_session_id IS NULL
        AND checkout_url IS NULL
        AND payment_reference IS NULL
        AND refund_reference IS NULL
        AND refund_external_reference IS NULL
        AND confirmed_by_user_id IS NULL
        AND refund_confirmed_by_user_id IS NULL
        AND refunded_at IS NULL
        AND created_by_user_id IS NOT DISTINCT FROM app_user_id()
        AND request_id IN (
            SELECT sr.request_id
            FROM service_requests AS sr
            JOIN document_types AS dt ON dt.doc_type_id = sr.doc_type_id
            WHERE dt.fee_amount = service_request_payments.amount
        )
    );

DROP POLICY IF EXISTS resident_own_insert ON service_request_payment_events;
CREATE POLICY resident_own_insert ON service_request_payment_events
    FOR INSERT TO resident_role
    WITH CHECK (
        reference IS NULL
        AND actor_user_id IS NOT DISTINCT FROM app_user_id()
        AND (
            (
                event_type = 'payment_method_selected'
                AND payment_status = 'Pending Payment'
                AND payment_record_id IN (
                    SELECT payment_record_id
                    FROM service_request_payments
                    WHERE payment_status = 'Pending Payment'
                )
            )
            OR (
                event_type = 'no_payment_required'
                AND payment_status = 'Paid'
                AND payment_record_id IN (
                    SELECT payment_record_id
                    FROM service_request_payments
                    WHERE payment_status = 'Paid' AND amount = 0
                )
            )
        )
    );

COMMIT;
