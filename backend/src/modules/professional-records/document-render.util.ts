// Shared helpers for rendering printable/exportable Professional Records documents
// (Scheme of Work, Lesson Plan, Lesson Notes) — same watermark + page shell for all.
export function escHtml(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A transparent, tiled watermark of the school name on every page — so a generated
// document can't be handed to a teacher at another school without the origin school
// being visibly stamped across it.
export function watermarkDataUri(schoolName: string): string {
  const text = escHtml(schoolName).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='140'>` +
    `<text x='0' y='90' font-family='Arial, sans-serif' font-size='26' font-weight='bold' fill='rgba(0,0,0,0.08)'>${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function documentShell(opts: {
  title: string; font: string; schoolName: string;
  headerHtml: string; bodyHtml: string; footerHtml: string;
  landscape?: boolean;
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escHtml(opts.title)}</title>
<style>
  body{
    font-family:'${escHtml(opts.font)}',serif;margin:24px;color:#111;
    background-image:url("${watermarkDataUri(opts.schoolName)}");background-repeat:repeat;background-position:0 0;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  h1{font-size:18px;text-align:center;margin:0 0 4px}
  .meta{font-size:12px;margin-bottom:14px}
  .meta div{margin-bottom:2px}
  table{border-collapse:collapse;width:100%}
  th{border:1px solid #999;padding:6px;font-size:11px;background:#f0f0f0;text-align:left}
  .field{margin-bottom:12px}
  .field .label{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;color:#333}
  .field .value{font-size:13px;white-space:pre-wrap;margin-top:2px}
  .sig{margin-top:36px;font-size:12px;display:flex;justify-content:space-between}
  @media print{@page{size:${opts.landscape ? 'landscape' : 'portrait'};margin:12mm}}
</style></head>
<body onload="window.print && window.print()">
  <h1>${escHtml(opts.title)}</h1>
  <div class="meta">${opts.headerHtml}</div>
  ${opts.bodyHtml}
  <div class="sig">${opts.footerHtml}</div>
</body></html>`;
}

export function field(label: string, value: any): string {
  if (!value || (Array.isArray(value) && value.length === 0)) return '';
  const v = Array.isArray(value) ? value.join(', ') : value;
  return `<div class="field"><div class="label">${escHtml(label)}</div><div class="value">${escHtml(v)}</div></div>`;
}
