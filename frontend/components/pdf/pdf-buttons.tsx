// ============================================================
// ZARODA SCHOOL MANAGEMENT SYSTEM
// PDF DOWNLOAD — Frontend
// Provides: usePdfDownload hook + ready-made buttons for
//   Report Card · Invoice · Receipt · Bib Sheet
//   Scheme of Work · Payslip · Teacher Folder
// ============================================================

'use client';
import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';

// ─────────────────────────────────────────────────────────────
// Core download hook — handles streaming PDF from server
// ─────────────────────────────────────────────────────────────
export function usePdfDownload() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const download = useCallback(async (
    endpoint: string,
    filename:  string,
    key:       string,
    method:    'GET' | 'POST' = 'GET',
    body?:     any,
  ) => {
    setDownloading(key);
    setError(null);
    try {
      const config: any = {
        url:          endpoint,
        method,
        responseType: 'blob',
        ...(body ? { data: body } : {}),
      };

      const response = await apiClient.request(config);

      // ── DIAGNOSTIC: inspect what the server actually returned ──
      const ct = response.headers?.['content-type'] || '(none)';
      const size = response.data?.size ?? 0;
      let head = '';
      try { head = (await response.data.slice(0, 8).text()).replace(/[^\x20-\x7E]/g, '.'); } catch {}
      const diag = `status ${response.status} · type ${ct} · ${size} bytes · starts "${head}"`;
      console.log('[PDF download]', diag);
      // A valid PDF blob begins with "%PDF". Anything else (JSON error, HTML, empty)
      // means the server didn't send a real PDF — surface it instead of saving junk.
      if (!head.startsWith('%PDF')) {
        let serverMsg = '';
        try { const t = await response.data.text(); try { serverMsg = JSON.parse(t)?.message || t.slice(0,200); } catch { serverMsg = t.slice(0,200); } } catch {}
        setError(`PDF not generated — ${diag}. Server said: ${serverMsg || '(empty)'}`);
        setDownloading(null);
        return;
      }

      const blob     = new Blob([response.data], { type: 'application/pdf' });
      const url      = URL.createObjectURL(blob);

      // Download via an anchor in THIS document. Opening a blob: URL in a new tab
      // (window.open) is blocked by Chrome's cross-partition blob policy
      // ("Failed to load PDF document"), so we download instead — it always works.
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      // Blob error responses need decoding to reveal the server message
      let msg = 'Could not generate PDF. Please try again.';
      try {
        if (err?.response?.data instanceof Blob) {
          const text = await err.response.data.text();
          const j = JSON.parse(text);
          if (j?.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
        } else if (err?.response?.data?.message) {
          msg = err.response.data.message;
        }
      } catch {/* keep default */}
      setError(msg);
    } finally {
      setDownloading(null);
    }
  }, []);

  // Browser-print path (no Puppeteer): fetch the styled HTML (with auth) and
  // write it into a new window that auto-opens the print dialog → Save as PDF.
  const printHtml = useCallback(async (endpoint: string, key: string) => {
    setDownloading(key);
    setError(null);
    // Open the window synchronously (inside the click) so the browser doesn't block the popup.
    const win = window.open('', '_blank');
    try {
      const response = await apiClient.request({ url: endpoint, method: 'GET', responseType: 'text' });
      const html = typeof response.data === 'string' ? response.data : String(response.data);
      // ── DIAGNOSTIC: what came back for the print HTML ──
      const ct = response.headers?.['content-type'] || '(none)';
      const diag = `status ${response.status} · type ${ct} · ${html.length} chars · starts "${html.slice(0, 30).replace(/\n/g,' ')}"`;
      console.log('[PDF print]', diag);
      if (win) {
        // If the response isn't HTML (e.g. a JSON error), show it instead of a blank tab.
        if (!/<(!doctype|html|body|table|div)/i.test(html.slice(0, 200))) {
          win.close();
          setError(`Print HTML not returned — ${diag}`);
          setDownloading(null);
          return;
        }
        // Same approach as the working timetable print: write the full HTML (which
        // includes its own window.onload print script) and close the document.
        win.document.write(html);
        win.document.close();
      } else {
        setError('Please allow pop-ups for this site to print.');
      }
    } catch (err: any) {
      if (win) win.close();
      let msg = 'Could not open document. Please try again.';
      try {
        if (err?.response?.data) {
          const d = err.response.data;
          const text = typeof d === 'string' ? d : (d instanceof Blob ? await d.text() : '');
          if (text) { try { const j = JSON.parse(text); if (j?.message) msg = j.message; } catch { /* html error */ } }
        }
      } catch {/* keep default */}
      setError(msg);
    } finally {
      setDownloading(null);
    }
  }, []);

  // Fetches print-ready HTML from the server and renders it to a REAL PDF file in the
  // browser (html2canvas + jsPDF from CDN), then downloads it. Works without any server
  // PDF engine. Falls back to the print window if the libraries can't load.
  const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(s);
  });

  const downloadHtmlAsPdf = useCallback(async (
    endpoint: string, filename: string, key: string,
    orientation: 'portrait' | 'landscape' = 'portrait',
  ) => {
    setDownloading(key);
    setError(null);
    try {
      const response = await apiClient.request({ url: endpoint, method: 'GET', responseType: 'text' });
      const html = typeof response.data === 'string' ? response.data : String(response.data);
      if (!/<(!doctype|html|body|table|div)/i.test(html.slice(0, 200))) {
        setError('Document not returned by server'); setDownloading(null); return;
      }
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const html2canvas = (window as any).html2canvas;
      const JsPDF = (window as any).jspdf?.jsPDF;
      if (!html2canvas || !JsPDF) throw new Error('pdf libs unavailable');

      const holder = document.createElement('div');
      holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${orientation === 'landscape' ? 1000 : 760}px;background:#fff`;
      holder.innerHTML = html;
      document.body.appendChild(holder);
      holder.querySelectorAll('script').forEach(s => s.remove());
      const canvas = await html2canvas(holder, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      document.body.removeChild(holder);

      const pdf = new JsPDF({ orientation, unit: 'pt', format: 'a4' });
      const M = 24;                                   // ~0.33in margin on all sides for printing
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - M * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      const img = canvas.toDataURL('image/png');
      const usableH = pageH - M * 2;
      if (imgH <= usableH) {
        pdf.addImage(img, 'PNG', M, M, imgW, imgH);
      } else {
        // Place the tall image and shift it up by one usable page-height per page, so each
        // page shows the next slice. The top/bottom margins are preserved on every page.
        let offset = 0;
        while (offset < imgH) {
          pdf.addImage(img, 'PNG', M, M - offset, imgW, imgH);
          offset += usableH;
          if (offset < imgH) pdf.addPage();
        }
      }
      pdf.save(filename);
    } catch {
      // Fallback to the print window so the user can still Save-as-PDF.
      await printHtml(endpoint, key);
    } finally {
      setDownloading(null);
    }
  }, [printHtml]);

  return { download, printHtml, downloadHtmlAsPdf, downloading, error };
}

// ─────────────────────────────────────────────────────────────
// Shared button style
// ─────────────────────────────────────────────────────────────
function PdfButton({
  onClick, loading, label = 'Download PDF', compact = false, variant = 'primary',
}: {
  onClick:   () => void;
  loading:   boolean;
  label?:    string;
  compact?:  boolean;
  variant?:  'primary' | 'ghost' | 'inline';
}) {
  const base   = `inline-flex items-center gap-2 font-medium rounded-lg transition-all disabled:opacity-60`;
  const sizes  = compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  const styles: Record<string, string> = {
    primary: 'bg-[#1a2e5a] text-white hover:bg-[#142347] shadow-sm',
    ghost:   'border border-[#1a2e5a] text-[#1a2e5a] hover:bg-[#f4f6fb]',
    inline:  'text-[#1a2e5a] hover:underline p-0 text-sm',
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`${base} ${sizes} ${styles[variant]}`}
    >
      {loading ? (
        <>
          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Generating…
        </>
      ) : (
        <>
          <PdfIcon size={14}/>
          {label}
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. REPORT CARD DOWNLOAD BUTTON
// Usage: <ReportCardButton learnerId="..." term="term_1" year="2025/2026" />
// ─────────────────────────────────────────────────────────────
export function ReportCardButton({
  learnerId, term, academicYear, learnerName, compact = false,
}: {
  learnerId:    string;
  term:         string;
  academicYear: string;
  learnerName?: string;
  compact?:     boolean;
}) {
  const { printHtml, downloadHtmlAsPdf, downloading, error } = usePdfDownload();
  const key = `rc-${learnerId}`;
  const fname = `report-card-${learnerName?.replace(/\s+/g,'-') || learnerId}-${term}.pdf`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
      <PdfButton
        loading={downloading === key}
        label={compact ? 'Print' : '🖨 Print'}
        compact={compact}
        variant="ghost"
        onClick={() => printHtml(
          `/pdf/report-card/${learnerId}/html?term=${term}&academicYear=${encodeURIComponent(academicYear)}`,
          key,
        )}
      />
      <PdfButton
        loading={downloading === `${key}-dl`}
        label={compact ? 'Save' : '↓ Save PDF'}
        compact={compact}
        onClick={() => downloadHtmlAsPdf(
          `/pdf/report-card/${learnerId}/html?term=${term}&academicYear=${encodeURIComponent(academicYear)}`,
          fname,
          `${key}-dl`,
          'portrait',
        )}
      />
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. BULK REPORT CARDS (whole stream)
// Usage: <BulkReportCardsButton streamId="..." term="term_1" year="2025/2026" />
// ─────────────────────────────────────────────────────────────
export function BulkReportCardsButton({
  streamId, term, academicYear, streamName,
}: {
  streamId:    string;
  term:        string;
  academicYear: string;
  streamName?: string;
}) {
  const { printHtml, downloadHtmlAsPdf, downloading, error } = usePdfDownload();
  const key = `bulk-rc-${streamId}`;
  const fname = `report-cards-${streamName?.replace(/\s+/g,'-') || streamId}-${term}.pdf`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
      <PdfButton
        loading={downloading === key}
        label="🖨 Print All"
        variant="ghost"
        onClick={() => printHtml(
          `/pdf/report-cards/bulk/html?streamId=${streamId}&term=${term}&academicYear=${encodeURIComponent(academicYear)}`,
          key,
        )}
      />
      <PdfButton
        loading={downloading === `${key}-dl`}
        label="↓ Save All PDF"
        onClick={() => downloadHtmlAsPdf(
          `/pdf/report-cards/bulk/html?streamId=${streamId}&term=${term}&academicYear=${encodeURIComponent(academicYear)}`,
          fname,
          `${key}-dl`,
          'portrait',
        )}
      />
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. INVOICE DOWNLOAD BUTTON
// Usage: <InvoiceButton invoiceId="..." invoiceNumber="INV-2025-001" />
// ─────────────────────────────────────────────────────────────
export function InvoiceButton({
  invoiceId, invoiceNumber, compact = false,
}: {
  invoiceId:     string;
  invoiceNumber: string;
  compact?:      boolean;
}) {
  const { download, downloading } = usePdfDownload();
  const key = `inv-${invoiceId}`;

  return (
    <PdfButton
      loading={downloading === key}
      label={compact ? 'Invoice' : '↓ Download Invoice'}
      compact={compact}
      variant={compact ? 'ghost' : 'primary'}
      onClick={() => download(
        `/pdf/invoice/${invoiceId}`,
        `invoice-${invoiceNumber}.pdf`,
        key,
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// 4. RECEIPT DOWNLOAD BUTTON
// Usage: <ReceiptButton receiptNumber="RCP-2025-00001" />
// ─────────────────────────────────────────────────────────────
export function ReceiptButton({
  receiptNumber, compact = false,
}: {
  receiptNumber: string;
  compact?:      boolean;
}) {
  const { download, downloading } = usePdfDownload();
  const key = `rcp-${receiptNumber}`;

  return (
    <PdfButton
      loading={downloading === key}
      label={compact ? 'Receipt' : '↓ Download Receipt'}
      compact={compact}
      variant="ghost"
      onClick={() => download(
        `/pdf/receipt/${receiptNumber}`,
        `receipt-${receiptNumber}.pdf`,
        key,
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// 5. BIB SHEET BUTTON
// Usage: <BibSheetButton championshipId="..." schoolId="..." champName="County Athletics" />
// ─────────────────────────────────────────────────────────────
export function BibSheetButton({
  championshipId, schoolId, champName,
}: {
  championshipId: string;
  schoolId?:      string;
  champName?:     string;
}) {
  const { download, downloading } = usePdfDownload();
  const key = `bib-${championshipId}`;

  return (
    <PdfButton
      loading={downloading === key}
      label="↓ Bib Registration Sheet"
      onClick={() => download(
        `/pdf/bib-sheet/${championshipId}${schoolId ? `?schoolId=${schoolId}` : ''}`,
        `bib-sheet-${champName?.replace(/\s+/g,'-') || championshipId}.pdf`,
        key,
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// 6. SCHEME OF WORK BUTTON
// Usage: <SchemeButton schemeId="..." title="Mathematics Grade 4 Term 1" />
// ─────────────────────────────────────────────────────────────
export function SchemeButton({
  schemeId, title, compact = false,
}: {
  schemeId: string;
  title?:   string;
  compact?: boolean;
}) {
  const { download, downloading } = usePdfDownload();
  const key = `scheme-${schemeId}`;

  return (
    <PdfButton
      loading={downloading === key}
      label={compact ? 'Scheme PDF' : '↓ Download Scheme of Work'}
      compact={compact}
      onClick={() => download(
        `/pdf/scheme/${schemeId}`,
        `scheme-${title?.replace(/\s+/g,'-') || schemeId}.pdf`,
        key,
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// 7. PAYSLIP BUTTON
// Usage: <PayslipButton staffId="..." periodId="..." staffName="John Doe" month="January 2025" />
// ─────────────────────────────────────────────────────────────
export function PayslipButton({
  staffId, periodId, staffName, month,
}: {
  staffId:   string;
  periodId:  string;
  staffName?: string;
  month?:    string;
}) {
  const { download, downloading } = usePdfDownload();
  const key = `payslip-${staffId}-${periodId}`;

  return (
    <PdfButton
      loading={downloading === key}
      label="↓ Download Payslip"
      compact
      variant="ghost"
      onClick={() => download(
        `/pdf/payslip/${staffId}?periodId=${periodId}`,
        `payslip-${staffName?.replace(/\s+/g,'-') || staffId}-${month?.replace(/\s+/g,'-') || periodId}.pdf`,
        key,
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// 8. TEACHER FOLDER BUTTON
// Downloads all of a teacher's professional documents merged into one PDF
// Usage: <TeacherFolderButton documentIds={[...]} documentTypes={[...]} />
// ─────────────────────────────────────────────────────────────
export function TeacherFolderButton({
  documentIds, documentTypes,
}: {
  documentIds:   string[];
  documentTypes: string[];
}) {
  const { download, downloading } = usePdfDownload();
  const key = 'teacher-folder';

  return (
    <PdfButton
      loading={downloading === key}
      label="↓ Download Teacher Folder (All Documents)"
      onClick={() => download(
        '/pdf/teacher-folder',
        'teacher-folder.pdf',
        key,
        'POST',
        { documentIds, documentTypes },
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// INLINE USAGE EXAMPLES — drop into existing pages
// ─────────────────────────────────────────────────────────────

// In Finance → Invoices table row:
export function InvoiceTableActions({ invoice }: { invoice: any }) {
  return (
    <div className="flex items-center gap-2">
      <InvoiceButton
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        compact
      />
      {invoice.receipts?.map((r: any) => (
        <ReceiptButton key={r.receiptNumber} receiptNumber={r.receiptNumber} compact/>
      ))}
    </div>
  );
}

// In Academic → Learner profile:
export function LearnerReportCardActions({ learnerId, learnerName, academicYear, term }: any) {
  return (
    <div className="flex gap-2 flex-wrap">
      {['term_1','term_2','term_3'].map(t => (
        <ReportCardButton
          key={t}
          learnerId={learnerId}
          learnerName={learnerName}
          term={t}
          academicYear={academicYear}
          compact
        />
      ))}
    </div>
  );
}

// In Academic → Stream view (HOI bulk download):
export function StreamReportCardsPanel({ stream, academicYear, term }: any) {
  const { download, downloading, error } = usePdfDownload();
  const key = `bulk-${stream.id}`;

  return (
    <div className="flex items-center justify-between bg-[#f4f6fb] border border-gray-100 rounded-xl p-4">
      <div>
        <div className="font-semibold text-gray-900 text-sm">{stream.name}</div>
        <div className="text-xs text-gray-400 mt-0.5">{stream.learnersCount} learners · {term.replace('_',' ')} {academicYear}</div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </div>
      <PdfButton
        loading={downloading === key}
        label={`↓ All ${stream.learnersCount} Report Cards`}
        onClick={() => download(
          `/pdf/report-cards/bulk?streamId=${stream.id}&term=${term}&academicYear=${encodeURIComponent(academicYear)}`,
          `report-cards-${stream.name.replace(/\s+/g,'-')}-${term}.pdf`,
          key,
        )}
      />
    </div>
  );
}

// In Sports → Championship registration:
export function ChampionshipBibPanel({ championship, schoolId }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-semibold text-gray-900">{championship.name}</div>
          <div className="text-xs text-gray-400 mt-0.5">{championship.level?.replace('_',' ')} · {championship.venue}</div>
        </div>
        <BibSheetButton
          championshipId={championship.id}
          schoolId={schoolId}
          champName={championship.name}
        />
      </div>
    </div>
  );
}

// In Professional Records → Teacher Folder:
export function TeacherFolderPanel({ schemes, plans, notes }: {
  schemes: any[]; plans: any[]; notes: any[];
}) {
  const allIds   = [...schemes.map(s=>s.id), ...plans.map(p=>p.id), ...notes.map(n=>n.id)];
  const allTypes = [...schemes.map(()=>'scheme'), ...plans.map(()=>'plan'), ...notes.map(()=>'notes')];
  const total    = allIds.length;

  return (
    <div className="bg-[#f4f6fb] border border-[#1a2e5a]/10 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 bg-[#1a2e5a] rounded-lg flex items-center justify-center flex-shrink-0">
          <PdfIcon size={18} color="white"/>
        </div>
        <div>
          <div className="font-semibold text-gray-900 text-sm">Teacher Professional Folder</div>
          <div className="text-xs text-gray-400">{total} document{total !== 1 ? 's' : ''} · Schemes · Lesson Plans · Lesson Notes</div>
        </div>
      </div>
      {total === 0 ? (
        <p className="text-xs text-gray-400">No documents to download yet.</p>
      ) : (
        <TeacherFolderButton documentIds={allIds} documentTypes={allTypes}/>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PDF icon SVG
// ─────────────────────────────────────────────────────────────
function PdfIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10,9 9,9 8,9"/>
    </svg>
  );
}
