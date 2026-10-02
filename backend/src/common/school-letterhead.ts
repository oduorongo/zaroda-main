import { DataSource } from 'typeorm';
import { safeImageSrc } from './security';

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));

export interface SchoolHeadInfo {
  name?: string; logo?: string; phone?: string; email?: string; address?: string; motto?: string;
}

/** The school's name, badge, contacts and motto, as the report card heads its page with. */
export async function schoolHeadInfo(ds: DataSource, tenantId: string): Promise<SchoolHeadInfo> {
  const rows = await ds.query(
    `SELECT name, settings->>'badgeBase64' AS logo, settings->>'phone' AS phone,
            settings->>'email' AS email, settings->>'address' AS address, settings->>'motto' AS motto
       FROM schools WHERE tenant_id::text = $1 LIMIT 1`,
    [tenantId],
  ).catch(() => []);
  return rows[0] || {};
}

/**
 * The report card's letterhead: badge, school name, contact line, motto, then a
 * subtitle naming the document. Shared so every printed school document carries
 * the same heading. Styles are inline, so it renders the same in any document.
 */
export function schoolLetterheadHtml(school: SchoolHeadInfo, subtitle: string): string {
  const logo = safeImageSrc(school.logo) ? `<img src="${esc(safeImageSrc(school.logo))}" style="height:60px;width:auto;margin:0 auto 6px;display:block"/>` : '';
  const contacts = [school.address, school.phone, school.email].filter(Boolean).map(esc).join(' · ');
  return `<div class="rc-head" style="text-align:center;border-bottom:3px solid #d4af37;padding-bottom:8px;margin-bottom:12px">
      ${logo}
      <h1 style="font-size:20px;margin:0">${esc(school.name || 'ZARODA School')}</h1>
      ${contacts ? `<p style="font-size:11px;color:#555;margin:2px 0">${contacts}</p>` : ''}
      ${school.motto ? `<p style="font-size:11px;font-style:italic;color:#777;margin:2px 0">“${esc(school.motto)}”</p>` : ''}
      <p style="margin:2px 0;font-size:12px;color:#555">${esc(subtitle)}</p>
    </div>`;
}
