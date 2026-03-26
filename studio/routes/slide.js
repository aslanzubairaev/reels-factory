const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', '..');
const PROJECTS_DIR = path.join(ROOT, 'projects');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// POST /api/generate-slide — render HTML template + data to PNG
router.post('/generate-slide', async (req, res) => {
  const { project, part_number, template, slide_data } = req.body;

  if (!project || !part_number || !template || !slide_data) {
    return res.status(400).json({
      error: 'Missing required fields: project, part_number, template, slide_data'
    });
  }

  const validTemplates = ['infographic', 'comparison', 'text-slide', 'text_slide', 'mockup'];
  if (!validTemplates.includes(template)) {
    return res.status(400).json({
      error: `Invalid template: ${template}. Must be one of: infographic, comparison, text-slide, mockup`
    });
  }

  // Normalize template name (text_slide -> text-slide)
  const templateFile = template.replace('_', '-');

  try {
    const templatePath = path.join(TEMPLATES_DIR, `${templateFile}.html`);
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: `Template not found: ${templateFile}` });
    }

    let html = fs.readFileSync(templatePath, 'utf-8');

    // Inject slide data
    // Escape </script> sequences inside JSON to prevent XSS breakout
    const safeJson = JSON.stringify(slide_data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
    const dataScript = `<script>window.__SLIDE_DATA__ = ${safeJson};</script>`;
    html = html.replace('<script>', dataScript + '\n<script>');

    // Prepare output path
    const slidesDir = path.join(PROJECTS_DIR, project, 'assets', 'slides');
    fs.mkdirSync(slidesDir, { recursive: true });

    const filename = `part_${part_number}_slide.png`;
    const outputPath = path.join(slidesDir, filename);

    // Version existing file before overwriting
    if (fs.existsSync(outputPath)) {
      let version = 1;
      while (fs.existsSync(path.join(slidesDir, `part_${part_number}_slide_v${version}.png`))) {
        version++;
      }
      fs.renameSync(outputPath, path.join(slidesDir, `part_${part_number}_slide_v${version}.png`));
    }

    // Render with Puppeteer (W-015: viewport = 1080x1920)
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1920 });
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: outputPath,
        type: 'png',
        clip: { x: 0, y: 0, width: 1080, height: 1920 }
      });
    } finally {
      await browser.close();
    }

    res.json({
      success: true,
      file: filename,
      path: `/api/assets/${project}/slides/${filename}`
    });

  } catch (e) {
    console.error('Slide generation error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
