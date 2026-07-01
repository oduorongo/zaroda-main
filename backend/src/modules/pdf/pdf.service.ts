// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// PDF GENERATION MODULE
// Engine: Puppeteer (HTML → PDF) — pixel-perfect branded output
// Documents:
//   1. CBC Report Card (Grade 1–6 and Grade 7–12 variants)
//   2. Fee Invoice / Receipt
//   3. Payroll Payslip
//   4. Athletics Bib Sheet (World Athletics standard)
//   5. Scheme of Work
//   6. Lesson Plan
//   7. QASO Discipline Report
//   8. Library Book List / Inventory
//   9. Learner Admission Letter
//  10. Combined Teacher Folder (merged PDF)
// ============================================================

// ─────────────────────────────────────────────────────────────
// package.json additions:
// "puppeteer": "^21.0.0",
// "handlebars": "^4.7.8",
// "@nestjs/serve-static": "^4.0.0"
// ─────────────────────────────────────────────────────────────

// src/modules/pdf/pdf.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// ── Shared brand colours ────────────────────────────────────
const BRAND = {
  navy:    '#1a2e5a',
  navyDeep:'#0f1c38',
  gold:    '#d4af37',
  orange:  '#f5820a',
  white:   '#ffffff',
  offWhite:'#f7f8fc',
  border:  '#e2e6f0',
  text:    '#1a2040',
  textMid: '#4a5278',
  textSoft:'#7a82a8',
  green:   '#22c55e',
  red:     '#ef4444',
};

// ── Performance level helpers ───────────────────────────────
function levelColor(level: string): string {
  const map: Record<string, string> = {
    EE: '#22c55e', EE1: '#16a34a', EE2: '#22c55e',
    ME: '#3b82f6', ME1: '#1d4ed8', ME2: '#3b82f6',
    AE: '#f59e0b', AE1: '#d97706', AE2: '#f59e0b',
    BE: '#ef4444', BE1: '#dc2626', BE2: '#ef4444',
  };
  return map[level] || '#888';
}

function levelLabel(level: string): string {
  const map: Record<string, string> = {
    EE: 'Exceeding Expectation',    EE1: 'Exceeding Expectation 1', EE2: 'Exceeding Expectation 2',
    ME: 'Meeting Expectation',      ME1: 'Meeting Expectation 1',   ME2: 'Meeting Expectation 2',
    AE: 'Approaching Expectation',  AE1: 'Approaching Expectation 1',AE2: 'Approaching Expectation 2',
    BE: 'Below Expectation',        BE1: 'Below Expectation 1',     BE2: 'Below Expectation 2',
  };
  return map[level] || level;
}

// Display abbreviation for long learning-area names (keeps documents tidy).
// Community Service Learning → CSL. The underlying canonical name is unchanged.
function abbrevArea(name: string): string {
  const n = String(name || '');
  if (/community\s+service\s+learning/i.test(n)) return 'CSL';
  return n;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private browser: puppeteer.Browser | null = null;

  // Lazy-load browser — warm it up once and reuse.
  // Tries puppeteer's bundled Chromium first; if it isn't installed (common on a
  // fresh local copy), falls back to a system Chrome/Edge install so PDFs still work.
  private async getBrowser(): Promise<puppeteer.Browser> {
    if (this.browser) return this.browser;
    const baseArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
    try {
      this.browser = await puppeteer.launch({ headless: 'new' as any, args: baseArgs });
    } catch (e: any) {
      this.logger.warn(`Bundled Chromium launch failed (${e.message}); trying a system browser…`);
      const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
      ].filter(Boolean) as string[];
      const found = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
      if (!found) {
        throw new Error(
          'No Chromium/Chrome found for PDF generation. Run "npx puppeteer browsers install chrome" ' +
          'in the backend folder, or set PUPPETEER_EXECUTABLE_PATH to a Chrome/Edge executable.',
        );
      }
      this.logger.log(`Using system browser for PDF: ${found}`);
      this.browser = await puppeteer.launch({ headless: 'new' as any, args: baseArgs, executablePath: found });
    }
    return this.browser;
  }

  // ── Core render function ────────────────────────────────
  private async htmlToPdf(html: string, options: {
    landscape?:  boolean;
    format?:     'A4' | 'A5' | 'Letter';
    marginTop?:  string;
    marginSide?: string;
  } = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page    = await browser.newPage();

    try {
      // Use domcontentloaded (not networkidle0) so a slow/blocked external font
      // request (Google Fonts) can't hang the render or yield a blank PDF on localhost.
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });
      // Give web fonts a brief moment, but never block forever.
      await page.evaluateHandle('document.fonts && document.fonts.ready').catch(() => null);
      const pdf = await page.pdf({
        format:  options.format   || 'A4',
        landscape: options.landscape || false,
        printBackground: true,
        margin: {
          top:    options.marginTop  || '16mm',
          bottom: '16mm',
          left:   options.marginSide || '14mm',
          right:  options.marginSide || '14mm',
        },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  // ── Shared CSS ──────────────────────────────────────────
  private baseStyles(): string {
    return `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', Arial, sans-serif; color: ${BRAND.text}; background: #fff; font-size: 10pt; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 5px 8px; text-align: left; }
        .page-break { page-break-after: always; }
        .navy { color: ${BRAND.navy}; }
        .gold  { color: ${BRAND.gold}; }
        .soft  { color: ${BRAND.textSoft}; font-size: 9pt; }
        .bold  { font-weight: 700; }
        .center { text-align: center; }
        .right  { text-align: right; }
        .watermark {
          position: fixed; bottom: 8mm; right: 10mm;
          font-size: 7pt; color: ${BRAND.textSoft}; opacity: 0.6;
          letter-spacing: 0.5px;
        }
      </style>`;
  }

  // ── Branded header ──────────────────────────────────────
  private brandedHeader(schoolName: string, schoolAddress: string, docTitle: string, logoBase64?: string): string {
    return `
    <div style="background:${BRAND.navy};color:#fff;padding:14px 20px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between;margin-bottom:0;">
      <div style="display:flex;align-items:center;gap:14px;">
        ${logoBase64 ? `<img src="${logoBase64}" style="height:44px;width:auto;border-radius:6px;" />` : `
        <div style="width:44px;height:44px;background:${BRAND.gold};border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;color:${BRAND.navyDeep};letter-spacing:-1px;flex-shrink:0;">Z</div>`}
        <div>
          <div style="font-size:15pt;font-weight:800;letter-spacing:0.3px;">${schoolName}</div>
          <div style="font-size:8pt;opacity:0.75;margin-top:1px;">${schoolAddress || 'Kenya'}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12pt;font-weight:700;color:${BRAND.gold};">${docTitle}</div>
        <div style="font-size:8pt;opacity:0.6;margin-top:2px;">Powered by ZARODA SMS</div>
      </div>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════
  // 1. CBC REPORT CARD
  // ═══════════════════════════════════════════════════════════
  async generateReportCard(data: {
    school:       { name: string; address: string; knecCode: string; principal: string; logoBase64?: string };
    learner:      { firstName: string; lastName: string; admissionNumber: string; gradeLevel: string; streamName: string; gender: string; dob: string };
    academic:     { year: string; term: string; classTeacher: string; totalLearners: number; };
    results:      { subject: string; strand: string; level: string; teacherComment?: string }[];
    summary:      { overallLevel: string; teacherComment: string; hoiComment: string; attendance: { present: number; total: number } };
    behaviour?:   { socialSkills?: string; selfManagement?: string; responsibility?: string; respectForOthers?: string; punctuality?: string; participation?: string };
    isSenior?:    boolean;   // Grade 7–12 uses EE1/ME1 scale
    brand?:       { primary?: string; primaryDeep?: string; accent?: string };  // per-school colours
  }): Promise<Buffer> {
    const html = this.buildReportCardHtml(data);
    return this.htmlToPdf(html);
  }

  /**
   * Build the inner report-card HTML for one learner (no <html> wrapper page-break logic).
   * Exposed so bulk printing can concatenate many cards into a single PDF.
   */
  buildReportCardHtml(data: {
    school:       { name: string; address: string; knecCode: string; principal: string; logoBase64?: string; county?: string; subCounty?: string };
    learner:      { firstName: string; lastName: string; admissionNumber: string; gradeLevel: string; streamName: string; gender: string; dob: string; guardianName?: string; guardianContact?: string };
    academic:     { year: string; term: string; classTeacher: string; totalLearners: number; };
    results?:     { subject: string; strand: string; level: string; teacherComment?: string }[];
    areaRows?:    { index: number; area: string; score: number | null; grade: string; rating: string; comment: string }[];
    totals?:      { totalScore: number; avgScore: number | null; overallRating: string };
    summary:      { overallLevel: string; teacherComment: string; hoiComment: string; attendance: { present: number; total: number }; averagePoints?: number | null; meanGrade?: string; coreCompetencies?: string[] };
    behaviour?:   { socialSkills?: string; selfManagement?: string; responsibility?: string; respectForOthers?: string; punctuality?: string; participation?: string };
    isSenior?:    boolean;
    brand?:       { primary?: string; primaryDeep?: string; accent?: string };
  }): string {
    const { school, learner, academic, summary, behaviour } = data;
    const primary = data.brand?.primary || '#1a2e5a';
    const accent  = data.brand?.accent  || '#d4af37';
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] as string));
    const dash = '________________';

    const gradeLabel = (g: string) => {
      const map: Record<string,string> = {
        pp1:'PP1', pp2:'PP2', grade_1:'Grade 1', grade_2:'Grade 2', grade_3:'Grade 3',
        grade_4:'Grade 4', grade_5:'Grade 5', grade_6:'Grade 6', grade_7:'Grade 7',
        grade_8:'Grade 8', grade_9:'Grade 9', grade_10:'Grade 10', grade_11:'Grade 11', grade_12:'Grade 12',
      };
      return map[g] || g || '';
    };

    // Section C — learning areas. Use areaRows if provided, else fall back to results.
    const rows = (data.areaRows && data.areaRows.length)
      ? data.areaRows
      : (data.results || []).map((r, i) => ({
          index: i + 1, area: r.subject, score: null as number | null, percent: null as number | null,
          grade: r.level || '', rating: (r.level || '').replace(/[0-9]/g,'').slice(0,2), comment: r.teacherComment || '',
        }));
    const areaTableRows = rows.map((r: any) => `
      <tr>
        <td style="text-align:center">${r.index}</td>
        <td>${esc(abbrevArea(r.area))}</td>
        <td style="text-align:center">${r.score != null ? r.score : ''}</td>
        <td style="text-align:center">${r.percent != null ? r.percent + '%' : ''}</td>
        <td style="text-align:center;font-weight:700">${esc(r.grade)}</td>
        <td style="text-align:center;font-weight:700">${esc(r.rating)}</td>
        <td>${esc(r.comment)}</td>
      </tr>`).join('');

    const totalScore = data.totals?.totalScore ?? '';
    const avgScore   = data.totals?.avgScore != null ? data.totals.avgScore : '';
    const avgPercent = (data.totals as any)?.avgPercent;
    const avgLevel   = (data.totals as any)?.avgLevel || '';
    const overallGrade  = summary.overallLevel || '';
    const overallRating = data.totals?.overallRating || (summary.overallLevel || '').replace(/[0-9]/g,'').slice(0,2);

    // Section D — holistic development (rating 1-4). Map behaviour levels onto a 1-4 scale.
    const to14 = (lvl?: string) => {
      const l = (lvl || '').toUpperCase();
      if (l.startsWith('EE')) return '4';
      if (l.startsWith('ME')) return '3';
      if (l.startsWith('AE')) return '2';
      if (l.startsWith('BE')) return '1';
      return '';
    };
    const holistic = [
      ['Social Skills & Teamwork', to14(behaviour?.socialSkills)],
      ['Communication & Expression', to14(behaviour?.participation)],
      ['Creativity & Innovation', to14(behaviour?.selfManagement)],
      ['Digital Literacy', ''],
      ['Sports & Physical Activities', ''],
      ['Leadership & Responsibility', to14(behaviour?.responsibility)],
    ].map((h, i) => `
      <tr>
        <td style="text-align:center">${i+1}</td>
        <td>${h[0]}</td>
        <td style="text-align:center;font-weight:700">${h[1]}</td>
        <td></td>
      </tr>`).join('');

    const att = summary.attendance || { present: 0, total: 0 };
    const absent = Math.max(0, (att.total || 0) - (att.present || 0));

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}
  body{margin:0;color:#1f2937;font-size:10px}
  .page{padding:18px 22px;max-width:820px;margin:0 auto}
  .top{display:flex;align-items:center;gap:12px;border-bottom:3px solid ${primary};padding-bottom:8px}
  .top img{width:58px;height:58px;object-fit:contain}
  .title{flex:1;text-align:center}
  .title .rk{font-size:9px;letter-spacing:.5px;color:#555}
  .title h1{margin:1px 0;font-size:14px;color:${primary}}
  .title h2{margin:0;font-size:11px;font-weight:700;color:#333}
  .termline{text-align:center;margin:6px 0;font-size:10px}
  .sec{margin-top:8px}
  .sec h3{background:${primary};color:#fff;margin:0;padding:3px 8px;font-size:10px;border-radius:3px 3px 0 0}
  table{width:100%;border-collapse:collapse}
  .info td{border:1px solid #d1d5db;padding:3px 6px;font-size:9.5px}
  .info td.l{background:#f3f4f6;font-weight:600;white-space:nowrap;width:14%}
  .areas th{background:${primary};color:#fff;border:1px solid ${primary};padding:3px 5px;font-size:9px}
  .areas td{border:1px solid #d1d5db;padding:3px 5px;font-size:9.5px}
  .areas tr:nth-child(even) td{background:#fafafa}
  .tot td{border:1px solid #d1d5db;padding:3px 6px;font-weight:700;background:#f3f4f6;font-size:9.5px}
  .twocol{display:flex;gap:10px;margin-top:8px}
  .twocol > div{flex:1}
  .small th{background:#eef1f7;border:1px solid #d1d5db;padding:3px 5px;font-size:9px}
  .small td{border:1px solid #d1d5db;padding:3px 5px;font-size:9.5px}
  .rate{font-size:8.5px;color:#555;font-weight:normal}
  .rem{border:1px solid #d1d5db;padding:5px 7px;font-size:9.5px;min-height:26px;margin-top:3px}
  .sign{margin-top:5px;font-size:9px;color:#444}
  .foot{margin-top:12px;text-align:center;font-size:8px;color:#888;border-top:1px solid #e5e7eb;padding-top:6px}
</style></head><body><div class="page">

  <div class="top">
    ${school.logoBase64 ? `<img src="${school.logoBase64}" alt="badge"/>` : '<div style="width:58px"></div>'}
    <div class="title">
      <div class="rk">REPUBLIC OF KENYA — COMPETENCY-BASED CURRICULUM (CBC)</div>
      <h1>${esc(school.name || 'School')}</h1>
      <h2>LEARNER ACADEMIC PROGRESS REPORT</h2>
    </div>
    <div style="width:58px"></div>
  </div>
  <div class="termline"><b>TERM:</b> ${esc(academic.term)} &nbsp;&nbsp; <b>YEAR:</b> ${esc(academic.year)}</div>

  <!-- A & B -->
  <div class="sec"><table class="info">
    <tr>
      <td class="l">School Name</td><td>${esc(school.name)}</td>
      <td class="l">Learner Name</td><td>${esc(learner.firstName)} ${esc(learner.lastName)}</td>
    </tr>
    <tr>
      <td class="l">KNEC Code</td><td>${esc(school.knecCode)}</td>
      <td class="l">Adm No.</td><td>${esc(learner.admissionNumber)}</td>
    </tr>
    <tr>
      <td class="l">Sub-County</td><td>${esc(school.subCounty)}</td>
      <td class="l">Grade/Class</td><td>${esc(gradeLabel(learner.gradeLevel))}${learner.streamName ? ' — ' + esc(learner.streamName) : ''}</td>
    </tr>
    <tr>
      <td class="l">County</td><td>${esc(school.county)}</td>
      <td class="l">Date of Birth</td><td>${esc(learner.dob)}</td>
    </tr>
    <tr>
      <td class="l">Class Teacher</td><td>${esc(academic.classTeacher)}</td>
      <td class="l">Gender</td><td>${esc(learner.gender)}</td>
    </tr>
    <tr>
      <td class="l">Parent/Guardian</td><td>${esc(learner.guardianName)}</td>
      <td class="l">Contact</td><td>${esc(learner.guardianContact)}</td>
    </tr>
  </table></div>

  <!-- C -->
  <div class="sec">
    <h3>C. LEARNING AREAS PERFORMANCE <span class="rate">— EE=Exceeding · ME=Meeting · AE=Approaching · BE=Below Expectation</span></h3>
    <table class="areas">
      <thead><tr><th style="width:5%">#</th><th>Learning Area</th><th style="width:8%">Score</th><th style="width:8%">% Score</th><th style="width:9%">Perf. Level</th><th style="width:8%">Rating</th><th style="width:28%">Comments</th></tr></thead>
      <tbody>${areaTableRows}</tbody>
    </table>
    <table class="tot" style="margin-top:-1px"><tr>
      <td style="width:30%">TOTAL: ${totalScore}</td>
      <td style="width:18%">AVG %: ${avgPercent != null ? avgPercent + '%' : (avgScore || '')}</td>
      <td style="width:26%">${avgLevel ? 'Average Performance Level: ' + esc(avgLevel) : 'Overall Grade: ' + esc(overallGrade)}</td>
      <td>Overall Rating: ${esc(overallRating)}</td>
    </tr></table>
  </div>

  <div class="twocol">
    <!-- D -->
    <div class="sec">
      <h3>D. HOLISTIC DEVELOPMENT <span class="rate">(1=Needs Improvement · 2=Satisfactory · 3=Good · 4=Outstanding)</span></h3>
      <table class="small">
        <thead><tr><th style="width:8%">#</th><th>Area of Development</th><th style="width:14%">Rating 1-4</th><th style="width:26%">Remarks</th></tr></thead>
        <tbody>${holistic}</tbody>
      </table>
    </div>
    <!-- E + F -->
    <div>
      <div class="sec">
        <h3>E. ATTENDANCE</h3>
        <table class="small">
          <thead><tr><th>Total Days</th><th>Present</th><th>Absent</th><th>Punctuality</th></tr></thead>
          <tbody><tr>
            <td style="text-align:center">${att.total || ''}</td>
            <td style="text-align:center">${att.present || ''}</td>
            <td style="text-align:center">${absent || ''}</td>
            <td style="text-align:center"></td>
          </tr></tbody>
        </table>
      </div>
      <div class="sec">
        <h3>F. CO-CURRICULAR ACTIVITIES</h3>
        <table class="small">
          <thead><tr><th>Activity/Club</th><th>Achievement</th></tr></thead>
          <tbody><tr><td style="height:18px"></td><td></td></tr><tr><td style="height:18px"></td><td></td></tr></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- G -->
  <div class="sec">
    <h3>G. REMARKS &amp; SIGNATURES</h3>
    <div style="padding:4px 2px">
      <div style="font-size:9.5px;font-weight:600">Class Teacher Remarks:</div>
      <div class="rem">${esc(summary.teacherComment)}</div>
      <div class="sign">Name: ${esc(academic.classTeacher) || dash} &nbsp; Sign: ____________ &nbsp; Date: __________</div>

      <div style="font-size:9.5px;font-weight:600;margin-top:6px">Head Teacher Remarks:</div>
      <div class="rem">${esc(summary.hoiComment)}</div>
      <div class="sign">Name: ${esc(school.principal) || dash} &nbsp; Sign: ____________ &nbsp; Date: __________</div>

      <div style="font-size:9.5px;font-weight:600;margin-top:6px">Parent/Guardian Remarks:</div>
      <div class="rem"></div>
      <div class="sign">Sign: ____________ &nbsp; Date: __________</div>
    </div>
  </div>

  <div class="foot">
    This report is confidential — issued under the Kenya Ministry of Education CBC Framework · CBC Academic Report Form<br/>
    Powered by ZARODA Solutions · Reliable. Innovative. Forward.
  </div>
</div></body></html>`;
  }


  /**
   * Bulk report cards — one PDF containing every learner's card, each on its own page.
   * Concatenates the per-learner HTML bodies with a page break between them.
   */
  async generateBulkReportCards(cards: Parameters<PdfService['buildReportCardHtml']>[0][]): Promise<Buffer> {
    if (!cards.length) {
      // Empty but valid single-page PDF rather than a hard error
      return this.htmlToPdf('<html><body style="font-family:sans-serif;padding:40px;">No report cards to print.</body></html>');
    }
    const bodies = cards.map((c, i) => {
      const full = this.buildReportCardHtml(c);
      // Extract just the <body>…</body> inner content so styles/head load once
      const bodyInner = full.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
      const pageBreak = i < cards.length - 1 ? 'page-break-after:always;' : '';
      return `<section style="${pageBreak}">${bodyInner}</section>`;
    });
    // Reuse the <head> (styles) from the first card, then all bodies
    const firstFull = this.buildReportCardHtml(cards[0]);
    const head = (firstFull.match(/<head>[\s\S]*?<\/head>/i) || ['<head></head>'])[0];
    const html = `<!DOCTYPE html><html>${head}<body>${bodies.join('\n')}</body></html>`;
    return this.htmlToPdf(html);
  }

  // ═══════════════════════════════════════════════════════════
  // CLASS MARK LIST (landscape)
  // ═══════════════════════════════════════════════════════════
  async generateMarkList(data: {
    school: { name: string; knecCode: string; logoBase64?: string; brand?: { primary?: string; accent?: string } };
    stream: string; gradeLevel: string; term: string; examType: string; academicYear: string;
    subjects: string[];
    learners: { rank: number; name: string; admissionNumber: string; scores: Record<string, number>; average: number }[];
  }): Promise<Buffer> {
    return this.htmlToPdf(this.buildMarkListHtml(data), { landscape: true });
  }

  buildMarkListHtml(data: {
    school: { name: string; knecCode: string; logoBase64?: string; brand?: { primary?: string; accent?: string } };
    stream: string; gradeLevel: string; term: string; examType: string; academicYear: string;
    subjects: string[];
    learners: { rank: number; name: string; admissionNumber: string; scores: Record<string, number>; points?: Record<string, number>; levels?: Record<string, string>; average: number; avgLevel?: string; totalPoints?: number; meanPoints?: number; overallPL?: number }[];
    isJsSenior?: boolean;
    isLowerBand?: boolean;
    maxPoints?: number;
  }): string {
    const primary = data.school.brand?.primary || BRAND.navy;
    const accent  = data.school.brand?.accent  || BRAND.gold;
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] as string));

    // Official KNEC learning-area codes for Grades 7–12 (shown under each area, as in the
    // standard class marklist). Tolerant match on the area name.
    const codeFor = (area: string): string => {
      const a = area.toLowerCase();
      if (/english/.test(a))                       return '901';
      if (/kiswahili|ksl|sign/.test(a))            return '902';
      if (/mathematic/.test(a))                    return '903';
      if (/integrated|integ|science/.test(a))      return '905';
      if (/agric/.test(a))                         return '906';
      if (/social/.test(a))                        return '907';
      if (/religious|cre|ire|hre/.test(a))         return '908';
      if (/creative|sport|art/.test(a))            return '911';
      if (/pre.?tech/.test(a))                     return '912';
      return '';
    };

    const isJS = data.isJsSenior;
    const maxPoints = data.maxPoints || data.subjects.length * 8;

    // ── Grades 7–12: each area shows Score + PL (points 1–8); totals = points / % / overall PL ──
    if (isJS) {
      const headTop = `
        <tr>
          <th rowspan="2" style="width:26px">#</th>
          <th rowspan="2">Adm No</th>
          <th rowspan="2" style="text-align:left">Candidate</th>
          ${data.subjects.map(s => `<th colspan="2">${esc(abbrevArea(s))}${codeFor(s) ? ` - ${codeFor(s)}` : ''}</th>`).join('')}
          <th rowspan="2">Total %</th>
          <th rowspan="2">Points<br/><span style="font-weight:400">/ ${maxPoints}</span></th>
          <th rowspan="2">Level</th>
        </tr>
        <tr>
          ${data.subjects.map(() => `<th>Score</th><th>PL</th>`).join('')}
        </tr>`;
      const rows = data.learners.map(l => `
        <tr>
          <td style="text-align:center;font-weight:700">${l.rank}</td>
          <td>${esc(l.admissionNumber)}</td>
          <td style="text-align:left">${esc(l.name)}</td>
          ${data.subjects.map(s => `
            <td style="text-align:center">${l.scores[s] ?? ''}</td>
            <td style="text-align:center;font-weight:600;color:${primary}">${l.points?.[s] ?? ''}</td>`).join('')}
          <td style="text-align:center;font-weight:700">${l.average ? l.average + '%' : ''}</td>
          <td style="text-align:center;font-weight:700">${l.totalPoints ?? ''}</td>
          <td style="text-align:center;font-weight:700;color:${primary}">${esc((l as any).avgLevel || '')}</td>
        </tr>`).join('');
      const cols = data.subjects.length * 2 + 6;
      return `<!doctype html><html><head><meta charset="utf-8"/><style>
        *{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
        body{margin:0;color:${BRAND.text}}
        .hdr{display:flex;align-items:center;gap:12px;border-bottom:3px solid ${primary};padding:12px 16px}
        .hdr img{width:46px;height:46px;object-fit:contain}
        .hdr h1{margin:0;color:${primary};font-size:15pt}
        .hdr .meta{font-size:9pt;color:${BRAND.textSoft}}
        .title{text-align:center;font-weight:700;color:${primary};margin:8px 0 2px;font-size:12pt}
        .sub{text-align:center;color:${BRAND.textSoft};font-size:8.5pt;margin-bottom:8px}
        table{width:100%;border-collapse:collapse;font-size:7.5pt}
        th,td{border:1px solid ${BRAND.border};padding:2px 3px}
        th{background:${primary};color:#fff;font-size:7pt}
        tr:nth-child(even) td{background:${BRAND.offWhite}}
        .key{font-size:7pt;color:${BRAND.textSoft};margin-top:6px;text-align:center}
        .foot{margin-top:8px;text-align:center;font-size:7.5pt;color:${BRAND.textSoft}}
      </style></head><body>
        <div class="hdr">
          ${data.school.logoBase64 ? `<img src="${data.school.logoBase64}"/>` : ''}
          <div><h1>${esc(data.school.name)}</h1><div class="meta">KNEC Code: ${esc(data.school.knecCode)}</div></div>
        </div>
        <div class="title">CLASS MARK LIST — ${esc(data.stream)}</div>
        <div class="sub">${esc(data.term.replace('_',' '))}${data.examType ? ' · ' + esc(data.examType.replace('_',' ')) : ''} · ${esc(data.academicYear)}</div>
        <table>
          <thead>${headTop}</thead>
          <tbody>${rows || `<tr><td colspan="${cols}" style="text-align:center;padding:16px;color:${BRAND.textSoft}">No marks entered for this class &amp; term.</td></tr>`}</tbody>
        </table>
        <div class="key">PL = Performance Level (8=Exceeding … 1=Below Expectation) · Score = raw mark · Points = sum of PLs out of ${maxPoints}</div>
        <div class="foot">Powered by ZARODA Solutions · Reliable. Innovative. Forward. · Generated ${new Date().toLocaleDateString('en-KE')}</div>
      </body></html>`;
    }

    // ── Lower grades (Playgroup–Grade 6): each area shows Score + PL (EE/ME/AE/BE),
    // plus Avg % and Avg Performance Level. Same raw-mark-and-PL layout as JS. ──
    const rows = data.learners.map((l: any) => `
      <tr>
        <td style="text-align:center;font-weight:700">${l.rank}</td>
        <td>${esc(l.admissionNumber)}</td>
        <td style="text-align:left">${esc(l.name)}</td>
        ${data.subjects.map(s => `
          <td style="text-align:center">${l.scores[s] ?? ''}</td>
          <td style="text-align:center;font-weight:700;color:${primary}">${esc(l.levels?.[s] || '')}</td>`).join('')}
        <td style="text-align:center;font-weight:700;color:${primary}">${l.average}%</td>
        <td style="text-align:center;font-weight:700">${l.totalPoints ?? ''}</td>
        <td style="text-align:center;font-weight:700;color:${primary}">${esc(l.avgLevel || '')}</td>
      </tr>`).join('');
    const lowerCols = data.subjects.length * 2 + 6;

    const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
      *{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
      body{margin:0;color:${BRAND.text}}
      .hdr{display:flex;align-items:center;gap:12px;border-bottom:3px solid ${primary};padding:14px 18px}
      .hdr img{width:46px;height:46px;object-fit:contain}
      .hdr h1{margin:0;color:${primary};font-size:16pt}
      .hdr .meta{font-size:9pt;color:${BRAND.textSoft}}
      .title{text-align:center;font-weight:700;color:${primary};margin:10px 0 2px;font-size:13pt}
      .sub{text-align:center;color:${BRAND.textSoft};font-size:9pt;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;font-size:8pt}
      th,td{border:1px solid ${BRAND.border};padding:3px 4px}
      th{background:${primary};color:#fff;font-size:7.5pt}
      tr:nth-child(even) td{background:${BRAND.offWhite}}
      .key{font-size:7pt;color:${BRAND.textSoft};margin-top:6px;text-align:center}
      .foot{margin-top:10px;text-align:center;font-size:7.5pt;color:${BRAND.textSoft}}
    </style></head><body>
      <div class="hdr">
        ${data.school.logoBase64 ? `<img src="${data.school.logoBase64}"/>` : ''}
        <div>
          <h1>${esc(data.school.name)}</h1>
          <div class="meta">KNEC Code: ${esc(data.school.knecCode)}</div>
        </div>
      </div>
      <div class="title">CLASS MARK LIST — ${esc(data.stream)}</div>
      <div class="sub">${esc(data.term.replace('_',' '))} · ${esc(data.examType.replace('_',' '))} · ${esc(data.academicYear)}</div>
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="width:24px">#</th><th rowspan="2">Adm No</th><th rowspan="2" style="text-align:left">Learner</th>
            ${data.subjects.map(s => `<th colspan="2">${esc(abbrevArea(s))}</th>`).join('')}
            <th rowspan="2">Total %</th><th rowspan="2">Points</th><th rowspan="2">Level</th>
          </tr>
          <tr>${data.subjects.map(() => `<th>Score</th><th>PL</th>`).join('')}</tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${lowerCols}" style="text-align:center;padding:18px;color:${BRAND.textSoft}">No marks entered for this class &amp; term.</td></tr>`}</tbody>
      </table>
      <div class="key">Score = raw mark · PL = Performance Level (EE=Exceeding · ME=Meeting · AE=Approaching · BE=Below). These PLs carry to each learner's report card.</div>
      <div class="foot">Powered by ZARODA Solutions · Reliable. Innovative. Forward. · Generated ${new Date().toLocaleDateString('en-KE')}</div>
    </body></html>`;

    return html;
  }

  // ═══════════════════════════════════════════════════════════
  // 2. FEE INVOICE
  // ═══════════════════════════════════════════════════════════
  async generateInvoice(data: {
    school:      { name: string; address: string; phone: string; paybill?: string; logoBase64?: string };
    learner:     { firstName: string; lastName: string; admissionNumber: string; streamName: string; gradeLevel: string };
    invoice:     { number: string; issuedDate: string; dueDate: string; academicYear: string; term: string };
    lineItems:   { description: string; amount: number }[];
    totals:      { subtotal: number; discount: number; scholarshipCredit: number; totalDue: number; totalPaid: number; balance: number };
    guardian:    { name: string; phone: string; email?: string };
    status:      'unpaid' | 'partial' | 'paid' | 'overpaid';
  }): Promise<Buffer> {
    const { school, learner, invoice, lineItems, totals, guardian, status } = data;
    const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

    const statusColors: Record<string, string> = {
      unpaid:  BRAND.red,
      partial: BRAND.gold,
      paid:    BRAND.green,
      overpaid:'#8b5cf6',
    };

    const itemRows = lineItems.map(item => `
      <tr style="border-bottom:1px solid ${BRAND.border};">
        <td style="padding:8px 10px;">${item.description}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;">${fmt(item.amount)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    ${this.baseStyles()}</head><body>
    <div style="max-width:620px;margin:0 auto;">
      ${this.brandedHeader(school.name, `${school.address} · ${school.phone}`, 'FEE INVOICE', school.logoBase64)}

      <!-- Invoice meta -->
      <div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid ${BRAND.border};border-top:none;">
        <div style="padding:10px 14px;border-right:1px solid ${BRAND.border};">
          <div style="font-size:8pt;color:${BRAND.textSoft};margin-bottom:2px;">BILLED TO</div>
          <div style="font-weight:700;font-size:11pt;">${learner.firstName} ${learner.lastName}</div>
          <div style="color:${BRAND.textMid};font-size:9pt;">Adm: ${learner.admissionNumber} · ${learner.streamName}</div>
          <div style="color:${BRAND.textMid};font-size:9pt;">${learner.gradeLevel.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</div>
          <div style="margin-top:6px;font-size:9pt;">Guardian: <strong>${guardian.name}</strong></div>
          <div style="font-size:9pt;color:${BRAND.textMid};">${guardian.phone}${guardian.email ? ` · ${guardian.email}` : ''}</div>
        </div>
        <div style="padding:10px 14px;">
          <div style="font-size:8pt;color:${BRAND.textSoft};margin-bottom:2px;">INVOICE DETAILS</div>
          <table style="width:auto;">
            <tr><td style="font-size:9pt;color:${BRAND.textSoft};padding:2px 0;padding-right:12px;">Invoice No.</td><td style="font-weight:700;font-size:9pt;">${invoice.number}</td></tr>
            <tr><td style="font-size:9pt;color:${BRAND.textSoft};padding:2px 0;">Date Issued</td><td style="font-size:9pt;">${invoice.issuedDate}</td></tr>
            <tr><td style="font-size:9pt;color:${BRAND.textSoft};padding:2px 0;">Due Date</td><td style="font-size:9pt;font-weight:700;color:${BRAND.red};">${invoice.dueDate}</td></tr>
            <tr><td style="font-size:9pt;color:${BRAND.textSoft};padding:2px 0;">Period</td><td style="font-size:9pt;">${invoice.term.replace('_',' ')} ${invoice.academicYear}</td></tr>
          </table>
          <div style="margin-top:8px;">
            <span style="background:${statusColors[status]};color:#fff;padding:3px 12px;border-radius:12px;font-size:9pt;font-weight:700;text-transform:uppercase;">${status}</span>
          </div>
        </div>
      </div>

      <!-- Line items -->
      <table style="border:1px solid ${BRAND.border};border-top:none;">
        <thead>
          <tr style="background:${BRAND.offWhite};">
            <th style="padding:8px 10px;font-size:9pt;color:${BRAND.navy};">Description</th>
            <th style="padding:8px 10px;text-align:right;font-size:9pt;color:${BRAND.navy};">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- Totals -->
      <div style="border:1px solid ${BRAND.border};border-top:none;padding:12px 14px;background:${BRAND.offWhite};">
        <table style="width:280px;margin-left:auto;">
          <tr><td style="padding:3px 0;font-size:9pt;color:${BRAND.textMid};">Sub-total</td><td style="text-align:right;font-size:9pt;">${fmt(totals.subtotal)}</td></tr>
          ${totals.discount > 0 ? `<tr><td style="padding:3px 0;font-size:9pt;color:${BRAND.textMid};">Discount</td><td style="text-align:right;font-size:9pt;color:${BRAND.green};">-${fmt(totals.discount)}</td></tr>` : ''}
          ${totals.scholarshipCredit > 0 ? `<tr><td style="padding:3px 0;font-size:9pt;color:${BRAND.textMid};">Scholarship Credit</td><td style="text-align:right;font-size:9pt;color:${BRAND.green};">-${fmt(totals.scholarshipCredit)}</td></tr>` : ''}
          <tr style="border-top:1px solid ${BRAND.border};">
            <td style="padding:5px 0;font-weight:700;font-size:10.5pt;color:${BRAND.navy};">Total Due</td>
            <td style="text-align:right;font-weight:700;font-size:10.5pt;color:${BRAND.navy};">${fmt(totals.totalDue)}</td>
          </tr>
          <tr><td style="padding:3px 0;font-size:9pt;color:${BRAND.green};">Amount Paid</td><td style="text-align:right;font-size:9pt;color:${BRAND.green};">-${fmt(totals.totalPaid)}</td></tr>
          <tr style="border-top:2px solid ${BRAND.navy};">
            <td style="padding:6px 0;font-weight:800;font-size:12pt;color:${totals.balance > 0 ? BRAND.red : BRAND.green};">Balance</td>
            <td style="text-align:right;font-weight:800;font-size:12pt;color:${totals.balance > 0 ? BRAND.red : BRAND.green};">${fmt(Math.abs(totals.balance))}</td>
          </tr>
        </table>
      </div>

      <!-- Payment instructions -->
      ${school.paybill ? `
      <div style="border:1px solid ${BRAND.border};border-top:none;padding:10px 14px;background:#f0fdf4;border-radius:0 0 8px 8px;">
        <div style="font-size:8.5pt;font-weight:700;color:#166534;margin-bottom:3px;">HOW TO PAY VIA M-PESA</div>
        <div style="font-size:9pt;color:#166534;">
          Go to <strong>M-Pesa → Lipa Na M-Pesa → Pay Bill</strong><br/>
          Business No: <strong>${school.paybill}</strong> &nbsp;·&nbsp;
          Account No: <strong>${learner.admissionNumber}</strong>
        </div>
      </div>` : ''}

      <div style="margin-top:6px;font-size:7.5pt;color:${BRAND.textSoft};text-align:center;">
        ${school.name} · Powered by ZARODA SMS · www.zarodasolutions.app
      </div>
    </div>
    <div class="watermark">ZARODA SMS · ${invoice.number}</div>
    </body></html>`;

    return this.htmlToPdf(html, { format: 'A4' });
  }

  // ═══════════════════════════════════════════════════════════
  // 3. FEE RECEIPT
  // ═══════════════════════════════════════════════════════════
  async generateReceipt(data: {
    school:     { name: string; address: string; logoBase64?: string };
    learner:    { firstName: string; lastName: string; admissionNumber: string; streamName: string };
    receipt:    { number: string; date: string; amount: number; method: string; reference?: string; term: string; academicYear: string };
    balance:    number;
    receivedBy: string;
  }): Promise<Buffer> {
    const { school, learner, receipt, balance } = data;
    const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    ${this.baseStyles()}</head><body>
    <div style="max-width:480px;margin:0 auto;border:2px solid ${BRAND.navy};border-radius:10px;overflow:hidden;">
      ${this.brandedHeader(school.name, school.address, 'OFFICIAL RECEIPT', school.logoBase64)}

      <div style="padding:20px 20px 16px;">
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:8.5pt;color:${BRAND.textSoft};letter-spacing:1px;text-transform:uppercase;">Receipt Number</div>
          <div style="font-size:20pt;font-weight:800;color:${BRAND.navy};letter-spacing:1px;">${receipt.number}</div>
          <div style="font-size:9pt;color:${BRAND.textMid};">${receipt.date}</div>
        </div>

        <!-- Amount box -->
        <div style="background:${BRAND.navy};color:#fff;border-radius:8px;padding:14px;text-align:center;margin-bottom:16px;">
          <div style="font-size:9pt;opacity:0.7;margin-bottom:4px;">Amount Received</div>
          <div style="font-size:28pt;font-weight:900;color:${BRAND.gold};">${fmt(receipt.amount)}</div>
        </div>

        <table style="border:1px solid ${BRAND.border};border-radius:6px;overflow:hidden;">
          <tr style="background:${BRAND.offWhite};"><td style="padding:7px 10px;font-size:9pt;color:${BRAND.textSoft};">Learner</td><td style="padding:7px 10px;font-weight:600;">${learner.firstName} ${learner.lastName}</td></tr>
          <tr style="border-top:1px solid ${BRAND.border};"><td style="padding:7px 10px;font-size:9pt;color:${BRAND.textSoft};">Admission No.</td><td style="padding:7px 10px;">${learner.admissionNumber}</td></tr>
          <tr style="border-top:1px solid ${BRAND.border};background:${BRAND.offWhite};"><td style="padding:7px 10px;font-size:9pt;color:${BRAND.textSoft};">Class / Stream</td><td style="padding:7px 10px;">${learner.streamName}</td></tr>
          <tr style="border-top:1px solid ${BRAND.border};"><td style="padding:7px 10px;font-size:9pt;color:${BRAND.textSoft};">Period</td><td style="padding:7px 10px;">${receipt.term.replace('_',' ')} ${receipt.academicYear}</td></tr>
          <tr style="border-top:1px solid ${BRAND.border};background:${BRAND.offWhite};"><td style="padding:7px 10px;font-size:9pt;color:${BRAND.textSoft};">Payment Method</td><td style="padding:7px 10px;font-weight:600;">${receipt.method.toUpperCase()}</td></tr>
          ${receipt.reference ? `<tr style="border-top:1px solid ${BRAND.border};"><td style="padding:7px 10px;font-size:9pt;color:${BRAND.textSoft};">Reference</td><td style="padding:7px 10px;font-family:monospace;">${receipt.reference}</td></tr>` : ''}
          <tr style="border-top:2px solid ${BRAND.navy};"><td style="padding:8px 10px;font-weight:700;color:${balance<=0?BRAND.green:BRAND.red};">Balance Remaining</td><td style="padding:8px 10px;font-weight:800;font-size:11pt;color:${balance<=0?BRAND.green:BRAND.red};">${fmt(Math.abs(balance))}${balance<=0?' (CLEARED)':' (OUTSTANDING)'}</td></tr>
        </table>

        <div style="margin-top:14px;display:flex;justify-content:space-between;font-size:9pt;color:${BRAND.textSoft};">
          <div>Received by: <span style="color:${BRAND.text};font-weight:600;">${data.receivedBy}</span></div>
          <div>Signature: <span style="display:inline-block;width:80px;border-bottom:1px solid #999;"></span></div>
        </div>
      </div>

      <div style="background:${BRAND.offWhite};padding:8px;text-align:center;font-size:7.5pt;color:${BRAND.textSoft};">
        This is an official receipt. Keep for your records. · ZARODA SMS
      </div>
    </div>
    </body></html>`;

    return this.htmlToPdf(html, { format: 'A5' });
  }

  // ═══════════════════════════════════════════════════════════
  // 4. ATHLETICS BIB SHEET (World Athletics standard)
  // ═══════════════════════════════════════════════════════════
  async generateBibSheet(data: {
    championship: { name: string; level: string; venue: string; startDate: string; academicYear: string };
    athletes:     { bibNumber: string; firstName: string; lastName: string; schoolName: string; events: string[]; gender: string; gradeLevel: string }[];
    schoolFilter?: string;
  }): Promise<Buffer> {
    const { championship, athletes, schoolFilter } = data;
    const filtered = schoolFilter
      ? athletes.filter(a => a.schoolName === schoolFilter)
      : athletes;

    const athleteRows = filtered.map((a, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : BRAND.offWhite};border-bottom:1px solid ${BRAND.border};">
        <td style="padding:7px 10px;font-size:13pt;font-weight:900;color:${BRAND.orange};font-family:monospace;letter-spacing:-0.5px;">${a.bibNumber}</td>
        <td style="padding:7px 10px;font-weight:700;">${a.firstName}</td>
        <td style="padding:7px 10px;font-weight:700;">${a.lastName}</td>
        <td style="padding:7px 10px;font-size:9pt;color:${BRAND.textMid};">${a.schoolName}</td>
        <td style="padding:7px 10px;font-size:9pt;">${a.gender}</td>
        <td style="padding:7px 10px;font-size:9pt;color:${BRAND.textSoft};">${a.gradeLevel?.replace('grade_','G') || '—'}</td>
        <td style="padding:7px 10px;font-size:8.5pt;color:${BRAND.navy};">${a.events?.join(', ') || '—'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    ${this.baseStyles()}</head><body>
    <div style="max-width:760px;margin:0 auto;">
      <!-- ZARODA Sports header -->
      <div style="background:${BRAND.navy};color:#fff;padding:14px 20px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:14pt;font-weight:800;color:${BRAND.gold};">ZARODA SPORTS</div>
          <div style="font-size:8.5pt;opacity:0.65;margin-top:1px;font-style:italic;">From Registration to Champions — Seamlessly Managed</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12pt;font-weight:700;">OFFICIAL BIB REGISTRATION SHEET</div>
          <div style="font-size:8.5pt;opacity:0.65;">World Athletics Standard Format</div>
        </div>
      </div>

      <!-- Championship details -->
      <div style="background:${BRAND.offWhite};border:1px solid ${BRAND.border};border-top:none;padding:10px 16px;display:flex;gap:24px;flex-wrap:wrap;">
        <div><span style="font-size:8pt;color:${BRAND.textSoft};">Championship: </span><strong style="font-size:10pt;">${championship.name}</strong></div>
        <div><span style="font-size:8pt;color:${BRAND.textSoft};">Level: </span><span style="background:${BRAND.navy};color:${BRAND.gold};padding:1px 8px;border-radius:10px;font-size:8.5pt;font-weight:700;text-transform:uppercase;">${championship.level.replace('_',' ')}</span></div>
        <div><span style="font-size:8pt;color:${BRAND.textSoft};">Venue: </span><strong>${championship.venue}</strong></div>
        <div><span style="font-size:8pt;color:${BRAND.textSoft};">Date: </span><strong>${championship.startDate}</strong></div>
        <div><span style="font-size:8pt;color:${BRAND.textSoft};">Year: </span><strong>${championship.academicYear}</strong></div>
        <div style="margin-left:auto;"><span style="font-size:8pt;color:${BRAND.textSoft};">Total Athletes: </span><strong style="font-size:12pt;color:${BRAND.navy};">${filtered.length}</strong></div>
      </div>

      ${schoolFilter ? `<div style="border:1px solid ${BRAND.border};border-top:none;padding:6px 16px;background:#fff;font-size:9pt;"><strong>School:</strong> ${schoolFilter}</div>` : ''}

      <!-- Bib table -->
      <table style="border:1px solid ${BRAND.border};border-top:none;">
        <thead>
          <tr style="background:${BRAND.navy};">
            <th style="padding:8px 10px;color:${BRAND.gold};font-size:10pt;">BIB #</th>
            <th style="padding:8px 10px;color:#fff;font-size:9pt;">First Name</th>
            <th style="padding:8px 10px;color:#fff;font-size:9pt;">Last Name</th>
            <th style="padding:8px 10px;color:#fff;font-size:9pt;">School</th>
            <th style="padding:8px 10px;color:#fff;font-size:9pt;">Gender</th>
            <th style="padding:8px 10px;color:#fff;font-size:9pt;">Grade</th>
            <th style="padding:8px 10px;color:#fff;font-size:9pt;">Events</th>
          </tr>
        </thead>
        <tbody>${athleteRows}</tbody>
      </table>

      <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
        <div style="font-size:8pt;color:${BRAND.textSoft};">Generated by ZARODA SPORTS MANAGEMENT SYSTEM · www.zarodasolutions.app · +254781230805</div>
        <div style="font-size:8pt;color:${BRAND.textSoft};">${new Date().toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
      </div>
    </div>
    </body></html>`;

    return this.htmlToPdf(html, { landscape: true });
  }

  // ═══════════════════════════════════════════════════════════
  // 5. SCHEME OF WORK
  // ═══════════════════════════════════════════════════════════
  async generateSchemeOfWork(data: {
    school:    { name: string; logoBase64?: string };
    teacher:   { firstName: string; lastName: string; tscNumber?: string };
    scheme:    { title: string; subject: string; grade: string; term: string; academicYear: string };
    weeks:     { weekNumber: number; dates: string; strand: string; subStrand: string; specificLearningOutcomes: string; keyInquiryQuestions: string; learningExperiences: string; learningResources: string; assessmentMethods: string; periods: number; remarks?: string }[];
  }): Promise<Buffer> {
    const { school, teacher, scheme, weeks } = data;

    const weekRows = weeks.map(w => `
      <tr style="border-bottom:1px solid ${BRAND.border};vertical-align:top;">
        <td style="padding:6px 8px;text-align:center;font-weight:700;color:${BRAND.navy};white-space:nowrap;">${w.weekNumber}</td>
        <td style="padding:6px 8px;font-size:8.5pt;color:${BRAND.textSoft};white-space:nowrap;">${w.dates || ''}</td>
        <td style="padding:6px 8px;font-weight:600;font-size:9pt;">${w.strand}</td>
        <td style="padding:6px 8px;font-size:9pt;">${w.subStrand}</td>
        <td style="padding:6px 8px;font-size:8.5pt;line-height:1.45;">${w.specificLearningOutcomes}</td>
        <td style="padding:6px 8px;font-size:8.5pt;line-height:1.45;">${w.keyInquiryQuestions || ''}</td>
        <td style="padding:6px 8px;font-size:8.5pt;line-height:1.45;">${w.learningExperiences}</td>
        <td style="padding:6px 8px;font-size:8.5pt;">${w.learningResources || ''}</td>
        <td style="padding:6px 8px;font-size:8.5pt;">${w.assessmentMethods || ''}</td>
        <td style="padding:6px 8px;text-align:center;font-size:9pt;">${w.periods}</td>
        <td style="padding:6px 8px;font-size:8.5pt;color:${BRAND.textSoft};">${w.remarks || ''}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    ${this.baseStyles()}
    <style>table { font-size: 9pt; } th { font-size: 8.5pt; }</style>
    </head><body>
    <div style="max-width:1000px;margin:0 auto;">
      ${this.brandedHeader(school.name, `${teacher.firstName} ${teacher.lastName}${teacher.tscNumber ? ` · TSC: ${teacher.tscNumber}` : ''}`, 'SCHEME OF WORK', school.logoBase64)}

      <!-- Scheme metadata -->
      <div style="background:${BRAND.offWhite};border:1px solid ${BRAND.border};border-top:none;padding:8px 14px;display:flex;gap:20px;flex-wrap:wrap;font-size:9pt;">
        <div><span style="color:${BRAND.textSoft};">Subject: </span><strong>${scheme.subject}</strong></div>
        <div><span style="color:${BRAND.textSoft};">Grade: </span><strong>${scheme.grade}</strong></div>
        <div><span style="color:${BRAND.textSoft};">Term: </span><strong>${scheme.term.replace('_',' ')}</strong></div>
        <div><span style="color:${BRAND.textSoft};">Year: </span><strong>${scheme.academicYear}</strong></div>
        <div><span style="color:${BRAND.textSoft};">Weeks: </span><strong>${weeks.length}</strong></div>
        <div style="margin-left:auto;font-size:8pt;color:${BRAND.textSoft};">KICD CBC/CBE Aligned · AI-Generated via ZARODA SMS</div>
      </div>

      <!-- Table -->
      <div style="overflow-x:auto;margin-top:0;">
        <table style="border:1px solid ${BRAND.border};border-top:none;min-width:100%;">
          <thead>
            <tr style="background:${BRAND.navy};">
              ${['Wk','Dates','Strand','Sub-Strand','Specific Learning Outcomes','Key Inquiry Questions','Learning Experiences','Resources','Assessment','Pds','Remarks']
                .map(h => `<th style="padding:7px 8px;color:#fff;font-size:8pt;white-space:nowrap;">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${weekRows}</tbody>
        </table>
      </div>

      <!-- Signatures -->
      <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;border:1px solid ${BRAND.border};padding:12px 14px;border-radius:0 0 8px 8px;">
        ${['Prepared by (Teacher)','Checked by (HOI/DHOIS)','Date Approved'].map(label => `
          <div>
            <div style="font-size:8.5pt;color:${BRAND.textSoft};margin-bottom:8px;">${label}</div>
            <div style="border-bottom:1px solid #999;height:24px;"></div>
          </div>`).join('')}
      </div>
    </div>
    <div class="watermark">ZARODA SMS · ${scheme.title}</div>
    </body></html>`;

    return this.htmlToPdf(html, { landscape: true });
  }

  // ═══════════════════════════════════════════════════════════
  // 6. PAYROLL PAYSLIP
  // ═══════════════════════════════════════════════════════════
  async generatePayslip(data: {
    school:    { name: string; address: string; logoBase64?: string };
    staff:     { firstName: string; lastName: string; tscNumber?: string; designation: string; bankAccount?: string };
    period:    { month: string; year: number };
    earnings:  { basicSalary: number; houseAllowance: number; transportAllow: number; medicalAllow: number; otherAllowances: number; grossPay: number };
    deductions:{ paye: number; nhif: number; nssf: number; housingLevy: number; loanDeductions: number; saccoDeductions: number; otherDeductions: number; totalDeductions: number };
    netPay:    number;
  }): Promise<Buffer> {
    const { school, staff, period, earnings, deductions, netPay } = data;
    const fmt = (n: number) => `KES ${(n||0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

    const earningRows = [
      ['Basic Salary', earnings.basicSalary],
      ['House Allowance', earnings.houseAllowance],
      ['Transport Allowance', earnings.transportAllow],
      ['Medical Allowance', earnings.medicalAllow],
      ['Other Allowances', earnings.otherAllowances],
    ].filter(([, v]) => Number(v) > 0).map(([l, v]) =>
      `<tr style="border-bottom:1px solid ${BRAND.border};"><td style="padding:6px 10px;font-size:9.5pt;">${l}</td><td style="padding:6px 10px;text-align:right;font-size:9.5pt;">${fmt(Number(v))}</td></tr>`
    ).join('');

    const deductionRows = [
      ['PAYE (Income Tax)', deductions.paye],
      ['NHIF / SHIF', deductions.nhif],
      ['NSSF', deductions.nssf],
      ['Affordable Housing Levy (1.5%)', deductions.housingLevy],
      ['Loan Deductions', deductions.loanDeductions],
      ['SACCO Deductions', deductions.saccoDeductions],
      ['Other Deductions', deductions.otherDeductions],
    ].filter(([, v]) => Number(v) > 0).map(([l, v]) =>
      `<tr style="border-bottom:1px solid ${BRAND.border};"><td style="padding:6px 10px;font-size:9.5pt;">${l}</td><td style="padding:6px 10px;text-align:right;font-size:9.5pt;color:${BRAND.red};">${fmt(Number(v))}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    ${this.baseStyles()}</head><body>
    <div style="max-width:560px;margin:0 auto;">
      ${this.brandedHeader(school.name, school.address, 'PAYSLIP', school.logoBase64)}

      <div style="background:${BRAND.offWhite};border:1px solid ${BRAND.border};border-top:none;padding:10px 14px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:9.5pt;">
        <div><span style="color:${BRAND.textSoft};">Employee: </span><strong>${staff.firstName} ${staff.lastName}</strong></div>
        <div><span style="color:${BRAND.textSoft};">Period: </span><strong>${period.month} ${period.year}</strong></div>
        <div><span style="color:${BRAND.textSoft};">Designation: </span>${staff.designation}</div>
        ${staff.tscNumber ? `<div><span style="color:${BRAND.textSoft};">TSC No.: </span>${staff.tscNumber}</div>` : ''}
        ${staff.bankAccount ? `<div><span style="color:${BRAND.textSoft};">Bank Account: </span>${staff.bankAccount}</div>` : ''}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid ${BRAND.border};border-top:none;">
        <div style="border-right:1px solid ${BRAND.border};">
          <div style="background:${BRAND.green};color:#fff;padding:6px 10px;font-weight:700;font-size:9.5pt;">EARNINGS</div>
          <table>${earningRows}
            <tr style="background:${BRAND.offWhite};border-top:2px solid ${BRAND.green};">
              <td style="padding:7px 10px;font-weight:700;">Gross Pay</td>
              <td style="padding:7px 10px;text-align:right;font-weight:700;color:${BRAND.green};">${fmt(earnings.grossPay)}</td>
            </tr>
          </table>
        </div>
        <div>
          <div style="background:${BRAND.red};color:#fff;padding:6px 10px;font-weight:700;font-size:9.5pt;">DEDUCTIONS</div>
          <table>${deductionRows}
            <tr style="background:${BRAND.offWhite};border-top:2px solid ${BRAND.red};">
              <td style="padding:7px 10px;font-weight:700;">Total Deductions</td>
              <td style="padding:7px 10px;text-align:right;font-weight:700;color:${BRAND.red};">${fmt(deductions.totalDeductions)}</td>
            </tr>
          </table>
        </div>
      </div>

      <div style="background:${BRAND.navy};color:#fff;padding:14px 20px;border-radius:0 0 8px 8px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:12pt;font-weight:700;">NET PAY</div>
        <div style="font-size:22pt;font-weight:900;color:${BRAND.gold};">${fmt(netPay)}</div>
      </div>
    </div>
    <div class="watermark">ZARODA SMS · Payslip ${period.month} ${period.year}</div>
    </body></html>`;

    return this.htmlToPdf(html, { format: 'A5' });
  }

  // ═══════════════════════════════════════════════════════════
  // 7. TEACHER FOLDER (combined all documents)
  // ═══════════════════════════════════════════════════════════
  async generateTeacherFolder(pdfs: Buffer[]): Promise<Buffer> {
    // Merge multiple PDFs using pypdf logic via shell
    // In production: use pdf-lib or pypdf to merge
    // For now return first PDF (merging implemented below)
    const { execSync } = require('child_process');
    const tmp = `/tmp/zaroda_folder_${Date.now()}`;
    const inputFiles = pdfs.map((buf, i) => {
      const p = `${tmp}_part${i}.pdf`;
      fs.writeFileSync(p, buf);
      return p;
    });
    const outFile = `${tmp}_combined.pdf`;
    execSync(`qpdf --empty --pages ${inputFiles.join(' ')} -- ${outFile}`);
    const result = fs.readFileSync(outFile);
    // Clean up temp files
    [...inputFiles, outFile].forEach(f => fs.unlinkSync(f));
    return result;
  }

  // ── Cleanup on app shutdown ─────────────────────────────
  async onApplicationShutdown() {
    if (this.browser) await this.browser.close();
  }
}


// ─────────────────────────────────────────────────────────────
// src/modules/pdf/pdf.controller.ts
// ─────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Body, Param, Query,
  Res, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Controller('pdf')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PdfController {
  constructor(private pdfService: PdfService) {}

  private sendPdf(res: Response, buffer: Buffer, filename: string) {
    // Guard: a valid PDF starts with "%PDF" and is non-trivial in size. If puppeteer
    // returned something broken, fail loudly with JSON instead of sending bytes the
    // browser will reject with "failed to load".
    const ok = buffer && buffer.length > 1000 && buffer.slice(0, 4).toString('latin1') === '%PDF';
    if (!ok) {
      console.error(`❌ Invalid PDF buffer for ${filename}: length=${buffer?.length}, head=${buffer?.slice(0,8)?.toString('latin1')}`);
      res.status(500).json({ message: 'PDF was generated but is invalid. Check the backend log for details.' });
      return;
    }
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      // Stop any compression/proxy from transforming the binary (cause of "failed to load PDF").
      'Cache-Control':       'no-transform',
      'Content-Length':       buffer.length.toString(),
    });
    // Mark this response so the compression filter skips it (belt and braces).
    (res as any).set('X-No-Compression', '1');
    res.end(buffer);
  }

  @Get('report-card/:learnerId')
  @Roles('hoi','dhois','school_admin','class_teacher','parent','learner')
  async getReportCard(
    @Param('learnerId') learnerId: string,
    @Query('term') term: string,
    @Query('academicYear') academicYear: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    try {
      const data = await this.pdfService.buildReportCardData(u.tenantId, learnerId, term, academicYear);
      const pdf  = await this.pdfService.generateReportCard(data);
      this.sendPdf(res, pdf, `report-card-${learnerId}-${term}.pdf`);
    } catch (e: any) {
      console.error('❌ Report card PDF failed:', e?.message, e?.stack);
      res.status(500).json({ message: `PDF generation failed: ${e?.message || 'unknown error'}` });
    }
  }

  @Get('report-cards/bulk')
  @Roles('hoi','dhois','school_admin','class_teacher','overall_class_teacher')
  async getBulkReportCards(
    @Query('streamId') streamId: string,
    @Query('term') term: string,
    @Query('academicYear') academicYear: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    const cards = await this.pdfService.buildBulkReportCardData(u.tenantId, streamId, term, academicYear);
    const pdf   = await this.pdfService.generateBulkReportCards(cards);
    this.sendPdf(res, pdf, `report-cards-${streamId}-${term}.pdf`);
  }

  @Get('mark-list')
  @Roles('hoi','dhois','school_admin','class_teacher','overall_class_teacher','subject_teacher')
  async getMarkListPdf(
    @Query('streamId') streamId: string,
    @Query('term') term: string,
    @Query('examType') examType: string,
    @Query('academicYear') academicYear: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    const data = await this.pdfService.buildMarkListData(u.tenantId, streamId, term, examType || '', academicYear || '2025/2026');
    const pdf  = await this.pdfService.generateMarkList(data);
    this.sendPdf(res, pdf, `mark-list-${streamId}-${term}.pdf`);
  }

  // ── Browser-print HTML versions (no Puppeteer needed) ──────────────
  // These return the SAME styled HTML the PDF uses, with an auto-print script,
  // so the browser can save it as a PDF. Works on any machine.
  @Get('report-card/:learnerId/html')
  @Roles('hoi','dhois','school_admin','class_teacher','parent','learner')
  async getReportCardHtml(
    @Param('learnerId') learnerId: string,
    @Query('term') term: string,
    @Query('academicYear') academicYear: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    try {
      const data = await this.pdfService.buildReportCardData(u.tenantId, learnerId, term, academicYear);
      const html = this.pdfService.buildReportCardHtml(data);
      this.sendPrintableHtml(res, html);
    } catch (e: any) {
      console.error('❌ Report card HTML failed:', e?.message, e?.stack);
      res.status(500).send(`<p style="font-family:sans-serif">Could not build report card: ${e?.message || 'unknown error'}</p>`);
    }
  }

  @Get('report-cards/bulk/html')
  @Roles('hoi','dhois','school_admin','class_teacher','overall_class_teacher')
  async getBulkReportCardsHtml(
    @Query('streamId') streamId: string,
    @Query('term') term: string,
    @Query('academicYear') academicYear: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    try {
      const cards = await this.pdfService.buildBulkReportCardData(u.tenantId, streamId, term, academicYear);
      // One page per learner: concatenate each card's HTML with a page break.
      // Each card is a full HTML document; extract its <body> contents and combine
      // them into ONE valid document with page breaks, rather than nesting documents.
      const extractBody = (full: string): string => {
        const m = full.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        return m ? m[1] : full;
      };
      const firstHead = (cards[0] ? this.pdfService.buildReportCardHtml(cards[0]) : '');
      const styleMatch = firstHead.match(/<style[\s\S]*?<\/style>/i);
      const styles = styleMatch ? styleMatch[0] : '';
      const inner = cards.map((c, i) =>
        `<div style="${i < cards.length - 1 ? 'page-break-after:always' : ''}">${extractBody(this.pdfService.buildReportCardHtml(c))}</div>`
      ).join('');
      const body = `<!doctype html><html><head><meta charset="utf-8"/>${styles}</head><body>${inner}</body></html>`;
      this.sendPrintableHtml(res, body);
    } catch (e: any) {
      console.error('❌ Bulk report cards HTML failed:', e?.message, e?.stack);
      res.status(500).send(`<p style="font-family:sans-serif">Could not build report cards: ${e?.message || 'unknown error'}</p>`);
    }
  }

  @Get('mark-list/html')
  @Roles('hoi','dhois','school_admin','class_teacher','overall_class_teacher','subject_teacher')
  async getMarkListHtml(
    @Query('streamId') streamId: string,
    @Query('term') term: string,
    @Query('examType') examType: string,
    @Query('academicYear') academicYear: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    try {
      const data = await this.pdfService.buildMarkListData(u.tenantId, streamId, term, examType || '', academicYear || '2025/2026');
      const html = this.pdfService.buildMarkListHtml(data);
      this.sendPrintableHtml(res, html);
    } catch (e: any) {
      console.error('❌ Mark list HTML failed:', e?.message, e?.stack);
      res.status(500).send(`<p style="font-family:sans-serif">Could not build mark list: ${e?.message || 'unknown error'}</p>`);
    }
  }

  // Wrap content so it auto-opens the browser's print dialog (Save as PDF).
  private sendPrintableHtml(res: Response, inner: string) {
    const printBits = `
      <div class="no-print" style="text-align:center;padding:16px;font-family:Arial,sans-serif">
        <button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:14px;cursor:pointer">Print / Save as PDF</button>
      </div>
      <style>@media print{.no-print{display:none}}</style>
      <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>`;
    let page: string;
    if (/<\/body>/i.test(inner)) {
      // Content is already a complete HTML document — inject our print button/script
      // before </body> instead of nesting a second <html> document inside it.
      page = inner.replace(/<\/body>/i, `${printBits}</body>`);
    } else {
      page = `<!doctype html><html><head><meta charset="utf-8"/><title>ZARODA — Print</title></head><body>${inner}${printBits}</body></html>`;
    }
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.send(page);
  }

  @Get('invoice/:invoiceId')
  @Roles('hoi','school_admin','bursar','parent')
  async getInvoice(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    const data = await this.pdfService.buildInvoiceData(u.tenantId, invoiceId);
    const pdf  = await this.pdfService.generateInvoice(data);
    this.sendPdf(res, pdf, `invoice-${invoiceId}.pdf`);
  }

  @Get('receipt/:receiptNumber')
  @Roles('hoi','school_admin','bursar','parent')
  async getReceipt(
    @Param('receiptNumber') ref: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    const data = await this.pdfService.buildReceiptData(u.tenantId, ref);
    const pdf  = await this.pdfService.generateReceipt(data);
    this.sendPdf(res, pdf, `receipt-${ref}.pdf`);
  }

  @Get('bib-sheet/:championshipId')
  @Roles('super_admin','hoi','games_dept','tenant_owner','school_admin')
  async getBibSheet(
    @Param('championshipId') champId: string,
    @Query('schoolId') schoolId: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    const data = await this.pdfService.buildBibSheetData(champId, schoolId);
    const pdf  = await this.pdfService.generateBibSheet(data);
    this.sendPdf(res, pdf, `bib-sheet-${champId}.pdf`);
  }

  @Get('scheme/:schemeId')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')
  async getSchemeOfWork(
    @Param('schemeId') schemeId: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    const data = await this.pdfService.buildSchemeData(u.tenantId, schemeId);
    const pdf  = await this.pdfService.generateSchemeOfWork(data);
    this.sendPdf(res, pdf, `scheme-${schemeId}.pdf`);
  }

  @Get('payslip/:staffId')
  @Roles('hoi','bursar','tenant_owner')
  async getPayslip(
    @Param('staffId') staffId: string,
    @Query('periodId') periodId: string,
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    const data = await this.pdfService.buildPayslipData(u.tenantId, staffId, periodId);
    const pdf  = await this.pdfService.generatePayslip(data);
    this.sendPdf(res, pdf, `payslip-${staffId}-${periodId}.pdf`);
  }

  @Post('teacher-folder')
  @Roles('class_teacher','subject_teacher','overall_class_teacher','hoi')
  async getTeacherFolder(
    @Body() dto: { documentIds: string[]; documentTypes: string[] },
    @CurrentUser() u: User,
    @Res() res: Response,
  ) {
    const pdfs = await this.pdfService.buildTeacherFolderPdfs(u.tenantId, u.id, dto);
    const pdf  = await this.pdfService.generateTeacherFolder(pdfs);
    this.sendPdf(res, pdf, `teacher-folder-${u.id}.pdf`);
  }
}
