// Central messaging helpers for ZARODA — one shared Gmail (app password) for email and one
// shared Africa's Talking account for SMS. All configured via environment variables on the
// server (no per-school secrets). Both functions fail soft: they return a status object and
// never throw, so callers (password reset, announcements) keep working even if a channel is
// misconfigured.

export interface SendResult { ok: boolean; channel: 'email' | 'sms'; detail?: string; }

/**
 * Send an email through Gmail SMTP using an app password.
 * Env: GMAIL_USER (full address), GMAIL_APP_PASSWORD (16-char app password),
 *      optional GMAIL_FROM_NAME.
 */
export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<SendResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return { ok: false, channel: 'email', detail: 'Email not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing).' };
  }
  try {
    // Lazy require so a missing optional dependency never breaks the build/boot.
    const nodemailer = eval('require')('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    const fromName = process.env.GMAIL_FROM_NAME || 'ZARODA SMS';
    await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html,
    });
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
export function normalisePhone(raw: string): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('0') && p.length === 10) return '+254' + p.slice(1);   // 07.. / 01..
  if (p.startsWith('254')) return '+' + p;
  if (p.length === 9 && (p.startsWith('7') || p.startsWith('1'))) return '+254' + p;
  return null;
}

export async function sendSms(to: string[], message: string): Promise<{ ok: boolean; sent: number; failed: number; detail?: string }> {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  if (!apiKey || !username) {
    return { ok: false, sent: 0, failed: to.length, detail: 'SMS not configured (AT_API_KEY / AT_USERNAME missing).' };
  }
  const numbers = to.map(normalisePhone).filter(Boolean) as string[];
  if (!numbers.length) return { ok: false, sent: 0, failed: to.length, detail: 'No valid phone numbers.' };
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
    const failed = numbers.length - sent;
    return { ok: sent > 0, sent, failed, detail: data?.SMSMessageData?.Message };
  } catch (err: any) {
    return { ok: false, sent: 0, failed: numbers.length, detail: err?.message || 'SMS send failed.' };
  }
}
