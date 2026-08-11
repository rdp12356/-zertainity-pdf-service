const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow large HTML payloads

app.post('/generate-pdf', async (req, res) => {
  const { html, filename } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'HTML content is required' });
  }

  let browser;
  try {
    // Launch headless Chromium
    // The arguments below are required to run securely inside Docker/Render
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Load the HTML content
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate the PDF using the Skia engine
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' }
    });

    await browser.close();

    // Send the PDF buffer directly back to the client/Edge Function
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'report.pdf'}"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF generation failed:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => {
  console.log(`PDF Microservice running on port ${PORT}`);
});
