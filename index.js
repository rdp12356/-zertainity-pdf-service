'use strict';

// Dedicated trusted upstream-only PDF renderer. Never expose HTML rendering without
// a strong shared secret set in Render AND in the Supabase Edge Function secrets.
const crypto = require('node:crypto');
const express = require('express');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '400kb', strict: true }));
const MAX_HTML = 300_000;
const MAX_OUTPUT = 9_000_000;
const PDF_TIMEOUT_MS = 20_000;
let activeJobs = 0;

function authorized(req) {
  const secret = process.env.PDF_SERVICE_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const supplied = req.get('x-pdf-secret') || '';
  if (!supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(secret)) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}
function safeFilename(name) {
  const basename = typeof name === 'string' ? name.replace(/[^A-Za-z0-9 ._()-]/g, '').replace(/^\.+/, '').trim().slice(0, 80) : '';
  return (basename || 'zertainity-results').replace(/\.pdf$/i, '') + '.pdf';
}
app.get('/', (_req, res) => res.json({ service: 'Zertainity PDF service', status: 'available' }));

app.post('/generate-pdf', async (req, res) => {
  // Fail CLOSED, rather than falling back to an unauthenticated rendering API.
  if (!process.env.PDF_SERVICE_SECRET || process.env.PDF_SERVICE_SECRET.length < 32) {
    return res.status(503).json({ error: 'PDF renderer not configured' });
  }
  if (!authorized(req)) return res.status(403).json({ error: 'Forbidden' });
  const html = req.body?.html;
  if (typeof html !== 'string' || !html.trim()) return res.status(400).json({ error: 'HTML required' });
  if (html.length > MAX_HTML) return res.status(413).json({ error: 'PDF request too large' });
  if (activeJobs >= 2) return res.status(503).json({ error: 'Renderer busy, retry later' });
  activeJobs += 1;

  let browser;
  let timer;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-background-networking', '--disable-default-apps', '--disable-extensions',
        '--disable-sync', '--no-first-run'],
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Only embedded data URIs allowed. Block HTTP(S), file://, localhost
      // and cloud metadata access even if untrusted HTML contains resource URLs.
      if (request.url().startsWith('data:')) request.continue();
      else request.abort('blockedbyclient');
    });
    const work = async () => {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10_000 });
      const raw = await page.pdf({
        format: 'A4', printBackground: true,
        margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' },
      });
      if (raw.length > MAX_OUTPUT) throw new Error('output limit exceeded');
      const doc = await PDFDocument.load(raw);
      doc.setTitle('Zertainity Career Assessment');
      doc.setAuthor('Zertainity');
      doc.setSubject('Career guidance report');
      const bytes = await doc.save();
      if (bytes.length > MAX_OUTPUT) throw new Error('output limit exceeded');
      return Buffer.from(bytes);
    };
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('render timeout')), PDF_TIMEOUT_MS);
    });
    const pdf = await Promise.race([work(), timeout]);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'attachment; filename="' + safeFilename(req.body?.filename) + '"');
    res.set('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (error) {
    // Do not return user HTML, stack traces, file paths or engine details.
    console.error('PDF request failed:', error?.name || 'Error');
    res.status(502).json({ error: 'PDF render failed' });
  } finally {
    if (timer) clearTimeout(timer);
    if (browser) await browser.close().catch(() => {});
    activeJobs -= 1;
  }
});

app.use((error, _req, res, _next) => {
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'PDF request too large' });
  return res.status(400).json({ error: 'Invalid PDF request' });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 8001;
  app.listen(port, '0.0.0.0', () => console.log('PDF renderer listening on port ' + port));
}
module.exports = { app, authorized, safeFilename };
