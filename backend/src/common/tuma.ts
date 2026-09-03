// Tuma (https://tuma.co.ke) payment gateway client — used to collect school
// subscription fees via M-Pesa STK push. Env: TUMA_EMAIL, TUMA_API_KEY.
//
// There is no public API reference for Tuma (their "API Docs" link just points to
// their blog) — this client is built from their example Postman collection, which
// only shows request shapes, not response schemas or the webhook payload. Response
// parsing below is deliberately permissive (checks several likely field names) and
// every raw response/callback body is kept by the caller for the DB record, so real
// payloads can be inspected and this tightened once live traffic is flowing.

const TUMA_BASE = 'https://api.tuma.co.ke';

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Decode a JWT's exp claim (seconds since epoch) without verifying the signature —
 *  we only need it to know when to refresh, the token itself is opaque to us. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.token;

  const email = process.env.TUMA_EMAIL;
  const apiKey = process.env.TUMA_API_KEY;
  if (!email || !apiKey) throw new Error('Tuma not configured (TUMA_EMAIL / TUMA_API_KEY missing).');

  const resp = await fetch(`${TUMA_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, api_key: apiKey }),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Tuma auth failed (${resp.status}): ${JSON.stringify(data).slice(0, 300)}`);

  const token = data.token || data.access_token || data.jwt
    || data.data?.token || data.data?.access_token || data.data?.jwt;
  if (!token) throw new Error(`Tuma auth response had no token: ${JSON.stringify(data).slice(0, 300)}`);

  // Fall back to a 23h TTL (their sample tokens are valid 24h) if exp can't be read.
  const expiresAt = jwtExpiry(token) || Date.now() + 23 * 60 * 60 * 1000;
  cachedToken = { token, expiresAt };
  return token;
}

/** Tuma's STK push expects a bare 2547XXXXXXXX phone number (no '+', see their
 *  example payload) — different format from the Africa's Talking one in messaging.ts. */
export function normalisePhoneForTuma(raw: string): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d]/g, '');
  if (p.startsWith('0') && p.length === 10) return '254' + p.slice(1);
  if (p.startsWith('254') && p.length === 12) return p;
  if (p.length === 9 && (p.startsWith('7') || p.startsWith('1'))) return '254' + p;
  return null;
}

export interface StkPushResult {
  ok: boolean;
  merchantRequestId?: string;
  raw?: any;
  detail?: string;
}

export async function initiateStkPush(opts: {
  amount: number; phone: string; description: string; callbackUrl: string;
}): Promise<StkPushResult> {
  try {
    const token = await getToken();
    const resp = await fetch(`${TUMA_BASE}/payment/stk-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        amount: opts.amount,
        phone: opts.phone,
        callback_url: opts.callbackUrl,
        description: opts.description,
      }),
    });
    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, raw: data, detail: `Tuma STK push failed (${resp.status}): ${JSON.stringify(data).slice(0, 300)}` };

    const merchantRequestId = data.merchant_request_id || data.MerchantRequestID
      || data.data?.merchant_request_id || data.data?.MerchantRequestID;
    return { ok: true, merchantRequestId, raw: data };
  } catch (err: any) {
    return { ok: false, detail: err?.message || 'Tuma STK push failed.' };
  }
}

export interface PaymentStatusResult {
  ok: boolean;
  status?: string;
  mpesaReceipt?: string;
  raw?: any;
  detail?: string;
}

export async function checkPaymentStatus(merchantRequestId: string): Promise<PaymentStatusResult> {
  try {
    const token = await getToken();
    const resp = await fetch(`${TUMA_BASE}/payment/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ merchant_request_id: merchantRequestId }),
    });
    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, raw: data, detail: `Tuma status check failed (${resp.status}): ${JSON.stringify(data).slice(0, 300)}` };

    const status = data.status || data.Status || data.result_desc || data.ResultDesc;
    const mpesaReceipt = data.mpesa_receipt || data.MpesaReceiptNumber || data.receipt_number;
    return { ok: true, status, mpesaReceipt, raw: data };
  } catch (err: any) {
    return { ok: false, detail: err?.message || 'Tuma status check failed.' };
  }
}

/** Best-effort read of a Tuma callback body — field names are a guess (no published
 *  webhook schema); the raw body is always stored by the caller alongside this. */
export function parseTumaCallback(body: any): { merchantRequestId?: string; success: boolean; mpesaReceipt?: string } {
  const merchantRequestId = body?.merchant_request_id || body?.MerchantRequestID
    || body?.data?.merchant_request_id || body?.data?.MerchantRequestID;
  const resultCode = body?.result_code ?? body?.ResultCode ?? body?.data?.result_code ?? body?.data?.ResultCode;
  const status = String(body?.status || body?.Status || body?.data?.status || '').toLowerCase();
  const success = resultCode === 0 || resultCode === '0' || status === 'success' || status === 'completed';
  const mpesaReceipt = body?.mpesa_receipt || body?.MpesaReceiptNumber || body?.receipt_number || body?.data?.mpesa_receipt;
  return { merchantRequestId, success, mpesaReceipt };
}
