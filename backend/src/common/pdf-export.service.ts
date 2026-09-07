// Renders a complete HTML document (scheme/lesson-plan/lesson-notes) to a real,
// downloadable PDF file via headless Chromium — instead of relying on the
// browser's own Print-to-PDF dialog, which is what "Preview in app" still uses.
// Deliberately self-contained (not pdf.service.ts, which is excluded from the
// build as unfinished dead code) so this stays small and easy to trust.
import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);
  private browser: puppeteer.Browser | null = null;

  private async getBrowser(): Promise<puppeteer.Browser> {
    if (this.browser) return this.browser;
    const baseArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
    try {
      this.browser = await puppeteer.launch({ headless: true, args: baseArgs });
    } catch (e: any) {
      this.logger.warn(`Bundled Chromium launch failed (${e.message}); trying a system browser…`);
      const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
      ].filter(Boolean) as string[];
      const found = candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
      if (!found) {
        throw new Error(
          'No Chromium/Chrome found for PDF generation. Run "npx puppeteer browsers install chrome" ' +
          'in the backend folder, or set PUPPETEER_EXECUTABLE_PATH to a Chrome/Edge executable.',
        );
      }
      this.logger.log(`Using system browser for PDF: ${found}`);
      this.browser = await puppeteer.launch({ headless: true, args: baseArgs, executablePath: found });
    }
    return this.browser;
  }

  async htmlToPdf(html: string, options: { landscape?: boolean } = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      // domcontentloaded (not networkidle0) so a slow/blocked Google Fonts request
      // can't hang the render or yield a blank PDF.
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.evaluateHandle('document.fonts && document.fonts.ready').catch(() => null);
      const pdf = await page.pdf({
        format: 'A4',
        landscape: options.landscape || false,
        printBackground: true,
        margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }
}
