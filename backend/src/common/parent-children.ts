import { DataSource } from 'typeorm';

// SQL: the last 9 digits of a free-form phone ("0712 345 678", "+254712345678" → "712345678").
export const PHONE9 = (col: string) => `RIGHT(regexp_replace(COALESCE(${col}, ''), '\\D', '', 'g'), 9)`;

/**
 * A parent's children: learners in their school whose guardian email OR guardian phone
 * matches the parent's account. Phones compare on their last 9 digits, so the same Kenyan
 * number matches however it was typed. Read from users, as phone-login tokens carry no phone.
 */
export async function linkedChildIds(ds: DataSource, user: any): Promise<string[]> {
  const u = (await ds.query(
    `SELECT LOWER(TRIM(email)) AS email, phone FROM users WHERE id::text = $1 LIMIT 1`, [user.id],
  ).catch(() => []))[0] || {};
  const email = u.email || String(user.email || '').toLowerCase().trim() || null;
  const digits = String(u.phone || '').replace(/\D/g, '');
  const phone9 = digits.length >= 9 ? digits.slice(-9) : null;
  if (!email && !phone9) return [];
  const rows = await ds.query(
    `SELECT id::text AS id FROM learners
      WHERE tenant_id::text = $1
        AND (($2::text IS NOT NULL AND LOWER(TRIM(guardian_email)) = $2)
          OR ($3::text IS NOT NULL AND ${PHONE9('guardian_phone')} = $3))`,
    [user.tenantId, email, phone9],
  ).catch(() => []);
  return rows.map((r: any) => r.id);
}
