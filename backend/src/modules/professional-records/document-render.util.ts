// Shared helpers for rendering printable/exportable Professional Records documents
// (Scheme of Work, Lesson Plan, Lesson Notes) — same watermark + page shell for all.
export function escHtml(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A Kiswahili document (schemes, lesson plans, notes) should have its labels/column
// titles in Kiswahili too, not just the AI-generated content — the printed KICD grid
// is bilingual across schools depending on the learning area, and this is the one we
// control. Matches "Kiswahili" as a whole subject name, not a substring of something else.
export function isKiswahiliSubject(subjectName?: string | null): boolean {
  return /\bkiswahili\b/i.test(String(subjectName || ''));
}

// English -> Kiswahili label glossary for every field/column title used across the
// three document templates. Falls back to the English key itself if untranslated.
const SW_LABELS: Record<string, string> = {
  'School': 'Shule',
  'Learning Area': 'Eneo la Kujifunza',
  'Grade': 'Darasa',
  'Date': 'Tarehe',
  'Time': 'Muda',
  'Roll': 'Idadi ya Wanafunzi',
  'Week': 'Wiki',
  'Wk': 'Wiki',
  'Lesson': 'Somo',
  'Lesson No.': 'Somo Na.',
  'Duration': 'Muda',
  'Term': 'Muhula',
  'Year': 'Mwaka',
  'Curriculum': 'Mtaala',
  'Strand': 'Mada Kuu',
  'Sub-Strand': 'Mada Ndogo',
  'Specific Learning Outcomes': 'Matokeo Mahususi ya Kujifunza',
  'Specific Learning Outcomes Covered': 'Matokeo Mahususi ya Kujifunza Yaliyoshughulikiwa',
  'SLOs': 'Matokeo ya Kujifunza',
  'Key Inquiry Question(s)': 'Swali/Maswali Muhimu ya Uchunguzi',
  'Key Inquiry Questions': 'Maswali Muhimu ya Uchunguzi',
  'Learning Resources': 'Nyenzo za Kujifunzia',
  'Learning Experiences': 'Uzoefu wa Kujifunza',
  'Resources': 'Nyenzo',
  'Assessment': 'Tathmini',
  'Core Competencies / Values / PCIs': 'Umahiri wa Msingi / Maadili / Masuala Mtambuka',
  'Reflection': 'Tafakari',
  'Organisation of Learning': 'Mpangilio wa Kujifunza',
  'Teacher Activities': 'Shughuli za Mwalimu',
  'Learner Activities': 'Shughuli za Mwanafunzi',
  'Introduction': 'Utangulizi',
  'Lesson Development': 'Ukuzaji wa Somo',
  'Conclusion': 'Hitimisho',
  'Extended Activities': 'Shughuli za Ziada',
  'Core Competencies': 'Umahiri wa Msingi',
  'Values': 'Maadili',
  'PCIs': 'Masuala Mtambuka',
  'Links to Other Learning Areas': 'Uhusiano na Maeneo Mengine ya Kujifunza',
  'Reflection / Self-Evaluation': 'Tafakari / Tathmini Binafsi',
  'Introduction (concept framing / link to previous learning)': 'Utangulizi (dhana na uhusiano na mafunzo yaliyopita)',
  'Content': 'Maudhui',
  'Key Vocabulary': 'Msamiati Muhimu',
  'Summary': 'Muhtasari',
  'Review Questions (with answers)': 'Maswali ya Mapitio (na Majibu)',
  'References': 'Marejeleo',
  'Teacher': 'Mwalimu',
  'TSC No': 'Na. ya TSC',
  'Prepared by': 'Imeandaliwa na',
  'Checked by D.H.O.I.': 'Imekaguliwa na D.H.O.I.',
  'Checked by': 'Imekaguliwa na',
  'Sign': 'Sahihi',
  'Support': 'Msaada',
  'Stage': 'Hatua',
  'Topic': 'Mada',
  'Name': 'Jina',
  'Class': 'Darasa',
};

export function label(text: string, kiswahili: boolean): string {
  return kiswahili ? (SW_LABELS[text] || text) : text;
}

// A transparent, tiled watermark of the school name on every page — so a generated
// document can't be handed to a teacher at another school without the origin school
// being visibly stamped across it.
//
// Deliberately rendered as real foreground text elements (position:fixed spans),
// NOT a CSS background-image/background-color. Every browser's print dialog hides
// backgrounds by default behind an opt-in "background graphics" checkbox, so a
// background-image watermark is invisible in print preview and on paper unless the
// viewer happens to have that box checked — foreground content always prints.
export function watermarkOverlayHtml(schoolName: string): string {
  const text = escHtml(schoolName).toUpperCase();
  if (!text) return '';
  const rowsPct = [8, 24, 40, 56, 72, 88];
  const colsPct = [10, 45, 80];
  const spans = rowsPct.flatMap((top) => colsPct.map((left) =>
    `<span style="position:absolute;top:${top}%;left:${left}%;transform:translate(-50%,-50%) rotate(-20deg);font-size:22px;font-weight:bold;color:rgba(0,0,0,0.12);white-space:nowrap;font-family:Arial,sans-serif">${text}</span>`,
  )).join('');
  return `<div style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;overflow:hidden;pointer-events:none">${spans}</div>`;
}

// Word opens a .doc export through its own legacy HTML renderer, which doesn't
// support position:fixed/absolute — it dumps every watermark span as ordinary
// stacked text at the top of the document instead of positioning them behind the
// content (looks fine in real browsers and mobile viewers, badly broken in Word).
// For that renderer, fall back to one plain in-flow line instead of the tiled overlay.
export function watermarkInlineHtml(schoolName: string): string {
  const text = escHtml(schoolName).toUpperCase();
  if (!text) return '';
  return `<div style="text-align:center;font-size:10px;letter-spacing:2px;color:#999;margin-bottom:10px">— ${text} —</div>`;
}

export function documentShell(opts: {
  title: string; font: string; schoolName: string;
  headerHtml: string; bodyHtml: string; footerHtml: string;
  landscape?: boolean;
  wordSafe?: boolean;
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escHtml(opts.title)}</title>
<style>
  body{font-family:'${escHtml(opts.font)}',serif;margin:24px;color:#111;position:relative}
  h1{font-size:18px;text-align:center;margin:0 0 4px}
  .meta{font-size:12px;margin-bottom:14px}
  .meta div{margin-bottom:2px}
  table{border-collapse:collapse;width:100%}
  th{border:1px solid #999;padding:6px;font-size:11px;background:#f0f0f0;text-align:left}
  .sig{margin-top:36px;font-size:12px;display:flex;justify-content:space-between}
  .doc-content{position:relative;z-index:1}
  @media print{@page{size:${opts.landscape ? 'landscape' : 'portrait'};margin:12mm}}
</style></head>
<body${opts.wordSafe ? '' : ' onload="window.print && window.print()"'}>
  ${opts.wordSafe ? '' : watermarkOverlayHtml(opts.schoolName)}
  <div class="doc-content">
    ${opts.wordSafe ? watermarkInlineHtml(opts.schoolName) : ''}
    <h1>${escHtml(opts.title)}</h1>
    <div class="meta">${opts.headerHtml}</div>
    ${opts.bodyHtml}
    <div class="sig">${opts.footerHtml}</div>
  </div>
</body></html>`;
}

