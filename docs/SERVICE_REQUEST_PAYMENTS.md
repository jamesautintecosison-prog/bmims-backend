# Service request payments

Service request payment state is stored independently from the request's approval status. A request can remain `Pending` or `Processing` while its payment is `Pending Payment`. Every payment status change and provider/manual transaction reference is kept in the payment event history.

## Database and application setup

1. Apply `database/migrations/013_service_request_payments.sql`, `014_resident_payment_insert_permissions.sql`, and `015_service_request_cancellation.sql` in order to the BMIMS database with the migration/owner connection after migrations `001`–`012`. The migrations create payment/history and request-cancellation fields, row-level security policies, indexes, and grants for the existing admin, staff, and resident roles.
2. Regenerate the Prisma client from the repository root:

   ```powershell
   Set-Location server
   npm install
   npx prisma generate
   ```

3. Add the following to the repository-root `.env` used by the API. The secret key and webhook secret must remain server-side and must never use a `VITE_` prefix.

   ```dotenv
   PAYMONGO_SECRET_KEY=sk_test_...
   PAYMONGO_WEBHOOK_SECRET=whsk_...
   CLIENT_URL=https://your-bmims-website.example
   ```

   Continue to configure the existing database URLs, `JWT_SECRET`, and `CLIENT_ORIGIN` as usual. `CLIENT_URL` is the public frontend base URL used for PayMongo success/cancel redirects.
4. Restart the API. Without valid PayMongo credentials, face-to-face requests remain available; online checkout reports a provider/configuration error.

## PayMongo merchant setup

- Create or activate a PayMongo merchant account and enable the payment methods you intend to accept. Checkout requests GCash, GrabPay, Maya, and card; PayMongo only offers methods enabled and eligible for the merchant account and transaction.
- Use a PayMongo **test** secret API key and the corresponding test-mode webhook signing secret during development. Do not use a publishable key for the server integration.
- Register a publicly reachable webhook URL: `https://your-api.example/api/payments/webhook`. Subscribe to `checkout_session.payment.paid`, `checkout_session.payment.failed`, and refund status events (`refund.updated`, and `refund.created` if available in the dashboard). Copy that endpoint's signing secret into `PAYMONGO_WEBHOOK_SECRET`.
- For local webhook testing, expose the API through a trusted HTTPS tunnel and register that temporary URL in PayMongo. Never disable signature verification.
- Before going live, complete PayMongo's merchant verification/onboarding, switch to live API and webhook credentials, configure the production redirect URL, and verify each accepted payment method and full-refund flow in PayMongo's dashboard.

The API creates hosted Checkout Sessions and refunds using PayMongo's server API. It never accepts a client-supplied amount: the amount is copied from the selected document type's database fee. The success redirect is informational; only a signed PayMongo webhook marks an online payment paid. Checkout creation is serialized per request and PayMongo idempotency keys are used to avoid duplicate sessions/refunds.

## Payment workflow and permissions

- Residents select online or face-to-face payment when filing. For online requests, BMIMS saves the request and immediately redirects the resident to PayMongo's hosted checkout page, where they select an enabled method and complete payment. Face-to-face requests remain `Pending Payment` until an assigned staff member or admin confirms receipt.
- Online payments remain pending until a signed `checkout_session.payment.paid` event is verified. Failed checkout/payment events are recorded separately from the service request status.
- If staff reject an already-paid online request, the backend creates a full PayMongo refund and sets `Refund Pending`. Only a successful PayMongo response/webhook changes it to `Refunded`. Failed initiation is visible to staff for retry.
- If a paid face-to-face request is rejected, it becomes `Refund Pending`; staff must physically return the money and explicitly confirm that it was returned before it becomes `Refunded`. Staff may include the manual refund reference.
- Residents may cancel only their own requests while request status is `Pending`. Requests already `Processing` or `Approved` must be cancelled through the barangay office. The API verifies ownership using the resident-scoped database role and performs a conditional update under the admin role; residents receive no direct update permission on service requests. Cancelling a request never erases it or its payment history. Paid online payments enter the provider refund process; paid face-to-face payments require staff to confirm the money has actually been returned.
- The staff endpoints check the authenticated staff/admin tier and first resolve the request using the existing committee-scoped RLS context. Payment records and history also have row-level security. Webhooks use the server-only admin database connection after verifying PayMongo's signature.

## Testing checklist

1. Apply migrations `013`–`015` in order and start the API/frontend. Submit a request with face-to-face payment and confirm it initially shows `Pending Payment`.
2. Sign in as staff assigned to the request's committee. Confirm receipt and verify payment becomes `Paid`; reject the request and verify it becomes `Refund Pending`. Confirm money returned only after actually returning it and verify it then becomes `Refunded`.
3. With test credentials and an enabled test method, submit an online request and choose **Pay online**. Complete or fail the PayMongo test checkout. Verify the UI changes only after the corresponding signed webhook is delivered. Open payment history to inspect checkout/payment references.
4. Reject a successfully paid online request. Verify the PayMongo refund appears in the merchant dashboard and the BMIMS status remains `Refund Pending` until a successful PayMongo refund response/webhook is recorded.
5. Retry the same checkout action while pending and verify it reuses the existing checkout URL. Deliver a webhook more than once and verify it does not duplicate the payment or refund.
6. Verify resident requests cannot confirm cash payments or modify refunds, and staff cannot access requests outside their assigned committees.
7. As a resident, cancel an unpaid request in `Pending` and verify status/time update without a refund. Try cancelling a request belonging to another resident via the API and verify it is denied. Verify `Processing`, `Approved`, `Released`, `Rejected`, and already-cancelled requests cannot be cancelled.
8. Cancel a paid online request and verify the refund is started but not shown as `Refunded` until PayMongo confirms it. Cancel a paid face-to-face request and verify staff must record the actual cash return before it becomes `Refunded`. Deliver a late successful payment webhook after cancellation and verify it triggers an online refund.

The server package does not currently define an automated test suite. Real payments cannot be accepted until valid merchant credentials, enabled payment methods, a reachable webhook endpoint, and production onboarding are completed.
