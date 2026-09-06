// Central messaging helpers for ZARODA — Resend (HTTP API) for email and Africa's
// Talking for SMS. All configured via environment variables on the server (no
// per-school secrets). Both functions fail soft: they return a status object and
// never throw, so callers (password reset, announcements) keep working even if a
// channel is misconfigured.
//
// Email used to go through Gmail SMTP, but Render (and most cloud hosts) blocks or
// silently drops outbound SMTP traffic to prevent spam abuse — connections would
// hang or fail with no way to fix it from application code. Resend sends over a
// normal HTTPS POST, which isn't subject to that restriction.

export interface SendResult { ok: boolean; channel: 'email' | 'sms'; detail?: string; }

/**
 * Send an email via the Resend API (plain HTTPS — not affected by cloud hosts
 * blocking outbound SMTP, unlike the Gmail SMTP approach this replaced).
 * Env: RESEND_API_KEY, optional RESEND_FROM (e.g. '"ZARODA SMS" <notifications@yourdomain.com>';
 *      defaults to Resend's shared test sender, which works without domain verification).
 */
export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, channel: 'email', detail: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const from = process.env.RESEND_FROM || 'ZARODA SMS <onboarding@resend.dev>';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from, to, subject, html,
        text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { ok: false, channel: 'email', detail: `Resend error ${resp.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true, channel: 'email' };
  } catch (err: any) {
    return { ok: false, channel: 'email', detail: err?.message || 'Email send failed.' };
  }
}

/**
 * Send an SMS through Africa's Talking.
 * Env: AT_API_KEY, AT_USERNAME (use 'sandbox' for testing), optional AT_SENDER_ID.
 * Phone numbers are normalised to Kenyan +254 E.164 where possible.
 */
// GSM-7 basic + extension charset — everything else (emoji, most accented letters,
// Kiswahili-specific punctuation, etc.) forces the whole message into UCS-2, which
// has a much smaller per-segment budget. Mirrors the frontend's composer counter
// (app/dashboard/communication/page.tsx) exactly, since this is what determines
// what Africa's Talking actually bills — a multi-segment message costs N units,
// not 1, and the wallet must debit for what AT really charged us.
// eslint-disable-next-line no-control-regex
const GSM7_RE = /^[\x20-\x7E¡£¤¥§¿ÄÅÆÉÑÖØÜßàäåæèéìñòöøùüΓΔΘΛΞΠΣΦΨΩ€]*$/;

export function smsSegmentCount(text: string): number {
  const gsm7 = GSM7_RE.test(text);
  const singleCap = gsm7 ? 160 : 70;
  const multiCap = gsm7 ? 153 : 67;
  const len = text.length;
  if (len === 0) return 0;
  if (len <= singleCap) return 1;
  return Math.ceil(len / multiCap);
}

export function normalisePhone(raw: string): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('0') && p.length === 10) return '+254' + p.slice(1);   // 07.. / 01..
  if (p.startsWith('254')) return '+' + p;
  if (p.length === 9 && (p.startsWith('7') || p.startsWith('1'))) return '+254' + p;
  return null;
}

export async function sendSms(to: string[], message: string): Promise<{ ok: boolean; sent: number; failed: number; segments: number; detail?: string }> {
  // Trim defensively — a trailing space/newline pasted into Render's env var editor
  // makes Africa's Talking reject an otherwise-correct key with a plain HTTP 401,
  // which looks identical to a genuinely wrong key.
  const apiKey = process.env.AT_API_KEY?.trim();
  const username = process.env.AT_USERNAME?.trim();
  const segments = smsSegmentCount(message);
  if (!apiKey || !username) {
    return { ok: false, sent: 0, failed: to.length, segments, detail: 'SMS not configured (AT_API_KEY / AT_USERNAME missing).' };
  }
  // Numbers that don't normalise (bad/legacy data — missing, a landline, a typo)
  // must still count as failed, not silently vanish from both sent and failed.
  const unnormalisable = to.length - to.map(normalisePhone).filter(Boolean).length;
  const numbers = to.map(normalisePhone).filter(Boolean) as string[];
  if (!numbers.length) return { ok: false, sent: 0, failed: to.length, segments, detail: 'No valid phone numbers — check the stored phone number format.' };
  try {
    const body = new URLSearchParams({
      username,
      to: numbers.join(','),
      message,
    });
    const senderId = process.env.AT_SENDER_ID;
    if (senderId) body.set('from', senderId);
    const resp = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'apiKey': apiKey,
      },
      body: body.toString(),
    });
    const data: any = await resp.json().catch(() => ({}));
    const recipients = data?.SMSMessageData?.Recipients || [];
    const sent = recipients.filter((r: any) => r.status === 'Success').length;
    const failed = (numbers.length - sent) + unnormalisable;
    // The top-level Message is often just a generic summary ("Sent to 1/1...") even on
    // total failure — the real reason (InsufficientBalance, InvalidSenderId,
    // UserInBlackList, etc.) is per-recipient, so surface the first rejected one.
    const firstRejected = recipients.find((r: any) => r.status !== 'Success');
    // On a 401 specifically, name exactly what's deployed (masked — never the real key)
    // so a mismatched/stale credential is obvious without exposing the secret.
    const authHint = resp.status === 401
      ? ` — deployed as username "${username}", key ending "…${apiKey.slice(-4)}" (${apiKey.length} chars). Check these match the AT dashboard exactly.`
      : '';
    const unnormalisableHint = unnormalisable > 0
      ? ` (${unnormalisable} of ${to.length} recipient number${unnormalisable === 1 ? '' : 's'} couldn't be recognised as a phone number and were never sent — check how they're stored)`
      : '';
    const detail = (firstRejected ? `${firstRejected.status}${firstRejected.statusCode != null ? ` (code ${firstRejected.statusCode})` : ''}${unnormalisableHint}` : undefined)
      || (!resp.ok ? `HTTP ${resp.status}${authHint}` : undefined)
      || (unnormalisable > 0 ? `${sent}/${to.length} sent${unnormalisableHint}` : undefined)
      || data?.SMSMessageData?.Message
      || (recipients.length === 0 ? `Unexpected response: ${JSON.stringify(data).slice(0, 200)}` : undefined);
    return { ok: sent > 0, sent, failed, segments, detail };
  } catch (err: any) {
    return { ok: false, sent: 0, failed: numbers.length, segments, detail: err?.message || 'SMS send failed.' };
  }
}
