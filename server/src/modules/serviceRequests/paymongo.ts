import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";

const API_URL = "https://api.paymongo.com/v1";

interface PayMongoResource {
  id: string;
  attributes: Record<string, unknown>;
}

interface PayMongoResponse {
  data?: PayMongoResource;
  errors?: { detail?: string }[];
}

function authorization() {
  if (!env.paymongoSecretKey) {
    throw new HttpError(503, "Online payments are not configured");
  }
  return `Basic ${Buffer.from(`${env.paymongoSecretKey}:`).toString("base64")}`;
}

async function requestPaymongo<T extends PayMongoResponse>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: authorization(),
      "Content-Type": "application/json",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(15_000),
  });
  const result = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !result?.data) {
    const detail = result?.errors?.map((error) => error.detail).filter(Boolean).join("; ");
    throw new HttpError(502, detail || "PayMongo could not complete the payment request");
  }
  return result;
}

export const paymongo = {
  async createCheckout(requestId: number, amount: number, documentName: string, attempt: number) {
    const successUrl = new URL("/requests", env.clientUrl);
    successUrl.searchParams.set("payment", "returned");
    const cancelUrl = new URL("/requests", env.clientUrl);
    cancelUrl.searchParams.set("payment", "cancelled");
    const response = await requestPaymongo<PayMongoResponse>("/checkout_sessions", {
      method: "POST",
      idempotencyKey: `bmims-request-${requestId}-checkout-${attempt}`,
      body: {
        data: {
          attributes: {
            line_items: [
              {
                currency: "PHP",
                amount,
                name: documentName,
                quantity: 1,
                description: `Barangay service request #${requestId}`,
              },
            ],
            payment_method_types: ["gcash", "grab_pay", "paymaya", "card"],
            description: `Service request #${requestId}`,
            reference_number: `BMIMS-${requestId}`,
            metadata: { request_id: String(requestId) },
            success_url: successUrl.toString(),
            cancel_url: cancelUrl.toString(),
          },
        },
      },
    });
    const resource = response.data;
    const checkoutUrl = resource?.attributes.checkout_url;
    if (typeof checkoutUrl !== "string") {
      throw new HttpError(502, "PayMongo did not return a checkout URL");
    }
    if (!resource) throw new HttpError(502, "PayMongo did not return a checkout session");
    return { id: resource.id, url: checkoutUrl };
  },

  async createRefund(paymentReference: string, amount: number, paymentRecordId: number) {
    const response = await requestPaymongo<PayMongoResponse>("/refunds", {
      method: "POST",
      idempotencyKey: `bmims-payment-${paymentRecordId}-refund`,
      body: {
        data: {
          attributes: {
            payment_id: paymentReference,
            amount,
            reason: "requested_by_customer",
            notes: `Refund for rejected BMIMS service request payment #${paymentRecordId}`,
            metadata: { payment_record_id: String(paymentRecordId) },
          },
        },
      },
    });
    const resource = response.data;
    if (!resource) throw new HttpError(502, "PayMongo did not return a refund record");
    const status =
      resource.attributes.status === "succeeded"
        ? "Succeeded"
        : resource.attributes.status === "failed"
          ? "Failed"
          : "Pending";
    return {
      id: resource.id,
      status,
    };
  },

  async getCheckoutPayment(checkoutId: string) {
    const response = await requestPaymongo<PayMongoResponse>(
      `/checkout_sessions/${encodeURIComponent(checkoutId)}`,
      {},
    );
    const resource = response.data;
    const payments = resource?.attributes.payments;
    if (!Array.isArray(payments)) return null;
    const payment = payments.find(
      (item): item is PayMongoResource => !!item && typeof item === "object" &&
        "id" in item && typeof item.id === "string",
    );
    if (!payment) return null;
    const amount = payment.attributes.amount;
    const currency = payment.attributes.currency;
    return {
      id: payment.id,
      amount: typeof amount === "number" ? amount : undefined,
      currency: typeof currency === "string" ? currency : undefined,
    };
  },
};

export function isValidPaymongoSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.paymongoWebhookSecret) {
    throw new HttpError(503, "PayMongo webhook verification is not configured");
  }
  if (!signature) return false;
  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const separator = part.indexOf("=");
      return separator < 0 ? ["", ""] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }),
  );
  const timestamp = parts.t;
  if (!timestamp || !/^\d+$/.test(timestamp) || !parts.te && !parts.li) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 15 * 60) return false;

  const expected = createHmac("sha256", env.paymongoWebhookSecret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest();
  return ["te", "li"].some((key) => {
    const candidate = parts[key];
    if (!candidate || !/^[a-f\d]{64}$/i.test(candidate)) return false;
    const received = Buffer.from(candidate, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
