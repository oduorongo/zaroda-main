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

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private browser: puppeteer.Browser | null = null;

  // Lazy-load browser — warm it up once and reuse
  private async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
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
      await page.setContent(html, { waitUntil: 'networkidle0' });
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
  }): Promise<Buffer> {
    const { school, learner, academic, results, summary, behaviour } = data;
    const isJuniorSenior = data.isSenior ||
      ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(learner.gradeLevel);

    const behaviourRows = behaviour ? Object.entries({
      'Social Skills': behaviour.socialSkills,
      'Self-Management': behaviour.selfManagement,
      'Responsibility': behaviour.responsibility,
      'Respect for Others': behaviour.respectForOthers,
      'Punctuality': behaviour.punctuality,
      'Participation': behaviour.participation,
    }).filter(([, v]) => v).map(([label, level]) => `
      <tr style="border-bottom:1px solid ${BRAND.border};">
        <td style="padding:5px 8px;font-size:9pt;">${label}</td>
        <td style="padding:5px 8px;text-align:center;">
          <span style="background:${levelColor(level!)};color:#fff;padding:2px 10px;border-radius:12px;font-size:8.5pt;font-weight:600;">${level}</span>
        </td>
      </tr>`).join('') : '';

    const subjectRows = results.map(r => `
      <tr style="border-bottom:1px solid ${BRAND.border};">
        <td style="padding:6px 8px;font-weight:500;">${r.subject}</td>
        <td style="padding:6px 8px;color:${BRAND.textSoft};font-size:9pt;">${r.strand || '—'}</td>
        <td style="padding:6px 8px;text-align:center;">
          <span style="background:${levelColor(r.level)};color:#fff;padding:3px 12px;border-radius:12px;font-size:9pt;font-weight:700;letter-spacing:0.3px;">${r.level}</span>
        </td>
        <td style="padding:6px 8px;color:${BRAND.textMid};font-size:9pt;">${r.teacherComment || ''}</td>
      </tr>`).join('');

    const attendancePct = summary.attendance.total > 0
      ? Math.round((summary.attendance.present / summary.attendance.total) * 100)
      : 0;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    ${this.baseStyles()}
    <style>
      .report-card { max-width: 720px; margin: 0 auto; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
      .info-cell { padding: 5px 10px; border: 0.5px solid ${BRAND.border}; font-size: 9.5pt; }
      .info-label { color: ${BRAND.textSoft}; font-size: 8pt; }
      .level-legend { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0; }
      .legend-item { display: flex; align-items: center; gap: 5px; font-size: 8.5pt; }
      .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    </style></head>
    <body>
    <div class="report-card">
      ${this.brandedHeader(school.name, school.address, 'END OF TERM REPORT', school.logoBase64)}

      <!-- Learner info -->
      <div style="background:${BRAND.offWhite};border:1px solid ${BRAND.border};border-top:none;">
        <div class="info-grid">
          <div class="info-cell"><div class="info-label">Learner Name</div><div class="bold">${learner.firstName} ${learner.lastName}</div></div>
          <div class="info-cell"><div class="info-label">Admission Number</div><div class="bold">${learner.admissionNumber}</div></div>
          <div class="info-cell"><div class="info-label">Grade / Class</div><div>${learner.gradeLevel.replace('_',' ').replace(/\b\w/g, c=>c.toUpperCase())} &nbsp;·&nbsp; ${learner.streamName}</div></div>
          <div class="info-cell"><div class="info-label">Academic Year / Term</div><div>${academic.year} &nbsp;·&nbsp; ${academic.term.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</div></div>
          <div class="info-cell"><div class="info-label">Class Teacher</div><div>${academic.classTeacher}</div></div>
          <div class="info-cell"><div class="info-label">Attendance</div>
            <div><span class="bold">${summary.attendance.present}</span> / ${summary.attendance.total} days
              &nbsp;<span style="background:${attendancePct>=90?BRAND.green:attendancePct>=75?BRAND.gold:BRAND.red};color:#fff;padding:1px 7px;border-radius:10px;font-size:8pt;">${attendancePct}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance legend -->
      <div style="padding:8px 10px;background:#fff;border:1px solid ${BRAND.border};border-top:none;">
        <div style="font-size:8pt;color:${BRAND.textSoft};margin-bottom:4px;">Performance Key ${isJuniorSenior ? '(Junior/Senior Scale)' : '(Primary Scale)'}:</div>
        <div class="level-legend">
          ${isJuniorSenior
            ? ['EE1','EE2','ME1','ME2','AE1','AE2','BE1','BE2']
            : ['EE','ME','AE','BE']
          }.map(l => `<div class="legend-item"><div class="legend-dot" style="background:${levelColor(l)}"></div><span>${l} — ${levelLabel(l)}</span></div>`).join('')}
        </div>
      </div>

      <!-- Academic results -->
      <div style="margin-top:14px;">
        <div style="background:${BRAND.navy};color:#fff;padding:7px 10px;font-weight:700;font-size:10pt;">Academic Performance</div>
        <table style="border:1px solid ${BRAND.border};border-top:none;">
          <thead style="background:${BRAND.offWhite};">
            <tr>
              <th style="padding:6px 8px;font-size:9pt;color:${BRAND.navy};">Learning Area / Subject</th>
              <th style="padding:6px 8px;font-size:9pt;color:${BRAND.navy};">Strand Focus</th>
              <th style="padding:6px 8px;text-align:center;font-size:9pt;color:${BRAND.navy};">Level</th>
              <th style="padding:6px 8px;font-size:9pt;color:${BRAND.navy};">Teacher's Comment</th>
            </tr>
          </thead>
          <tbody>${subjectRows}</tbody>
        </table>
      </div>

      <!-- Overall + behaviour side by side -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;">
        <!-- Overall performance -->
        <div>
          <div style="background:${BRAND.navy};color:#fff;padding:7px 10px;font-weight:700;font-size:10pt;">Overall Performance</div>
          <div style="border:1px solid ${BRAND.border};border-top:none;padding:12px 10px;text-align:center;">
            <div style="font-size:28pt;font-weight:900;color:${levelColor(summary.overallLevel)};">${summary.overallLevel}</div>
            <div style="font-size:9pt;color:${BRAND.textMid};margin-top:2px;">${levelLabel(summary.overallLevel)}</div>
          </div>
          <div style="border:1px solid ${BRAND.border};border-top:none;padding:10px;">
            <div style="font-size:8.5pt;color:${BRAND.textSoft};margin-bottom:4px;font-weight:600;">CLASS TEACHER'S COMMENT</div>
            <div style="font-size:9.5pt;color:${BRAND.text};line-height:1.5;">${summary.teacherComment}</div>
            <div style="margin-top:16px;border-top:0.5px solid ${BRAND.border};padding-top:8px;">
              <span style="font-size:8.5pt;color:${BRAND.textSoft};">Signature: </span>
              <span style="display:inline-block;width:100px;border-bottom:1px solid #999;"></span>
            </div>
          </div>
        </div>

        <!-- Behaviour + HOI -->
        <div>
          ${behaviour ? `
          <div style="background:${BRAND.navy};color:#fff;padding:7px 10px;font-weight:700;font-size:10pt;">Behaviour Assessment</div>
          <table style="border:1px solid ${BRAND.border};border-top:none;">
            <thead style="background:${BRAND.offWhite};">
              <tr>
                <th style="padding:5px 8px;font-size:9pt;color:${BRAND.navy};">Competency</th>
                <th style="padding:5px 8px;text-align:center;font-size:9pt;color:${BRAND.navy};">Level</th>
              </tr>
            </thead>
            <tbody>${behaviourRows}</tbody>
          </table>` : ''}
          <div style="border:1px solid ${BRAND.border};${behaviour?'border-top:none':'border-top:none;margin-top:14px;'};padding:10px;margin-top:${behaviour?'12':'0'}px;">
            <div style="font-size:8.5pt;color:${BRAND.textSoft};margin-bottom:4px;font-weight:600;">HEAD OF INSTITUTION'S COMMENT</div>
            <div style="font-size:9.5pt;color:${BRAND.text};line-height:1.5;">${summary.hoiComment}</div>
            <div style="margin-top:16px;border-top:0.5px solid ${BRAND.border};padding-top:8px;">
              <span style="font-size:8.5pt;color:${BRAND.textSoft};">Name: </span>
              <span style="display:inline-block;width:120px;border-bottom:1px solid #999;"></span>
              <span style="margin-left:16px;font-size:8.5pt;color:${BRAND.textSoft};">Sign: </span>
              <span style="display:inline-block;width:80px;border-bottom:1px solid #999;"></span>
            </div>
            <div style="margin-top:8px;">
              <span style="font-size:8.5pt;color:${BRAND.textSoft};">School Stamp: </span>
              <span style="display:inline-block;width:60px;height:60px;border:1px solid ${BRAND.border};border-radius:50%;"></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="margin-top:12px;padding:8px 10px;background:${BRAND.offWhite};border:1px solid ${BRAND.border};border-radius:0 0 8px 8px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:8pt;color:${BRAND.textSoft};">${school.name} · KNEC Code: ${school.knecCode} · Principal: ${school.principal}</div>
        <div style="font-size:7.5pt;color:${BRAND.textSoft};">Powered by ZARODA SMS · www.zarodasolutions.app</div>
      </div>
    </div>
    <div class="watermark">ZARODA SMS · Generated ${new Date().toLocaleDateString('en-KE')}</div>
    </body></html>`;

    return this.htmlToPdf(html);
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

@Controller('api/v1/pdf')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PdfController {
  constructor(private pdfService: PdfService) {}

  private sendPdf(res: Response, buffer: Buffer, filename: string) {
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':       buffer.length.toString(),
    });
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
    const data = await this.pdfService.buildReportCardData(u.tenantId, learnerId, term, academicYear);
    const pdf  = await this.pdfService.generateReportCard(data);
    this.sendPdf(res, pdf, `report-card-${learnerId}-${term}.pdf`);
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
