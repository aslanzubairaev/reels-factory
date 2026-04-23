const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { assertSafeProjectName } = require('../lib/projects');

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

  let safeProject;
  try {
    safeProject = assertSafeProjectName(project);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const safePartNumber = Number(part_number);
  if (!Number.isInteger(safePartNumber) || safePartNumber < 1 || safePartNumber > 99) {
    return res.status(400).json({ error: 'part_number must be an integer between 1 and 99' });
  }

  const validTemplates = ['infographic', 'comparison', 'text-slide', 'text_slide', 'mockup'];
  if (!validTemplates.includes(template)) {
    return res.status(400).json({
      error: `Invalid template: ${template}. Must be one of: infographic, comparison, text-slide, mockup`
    });
  }

  // Normalize template name (text_slide -> text-slide). Safe: whitelist проверен выше.
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
    const slidesDir = path.join(PROJECTS_DIR, safeProject, 'assets', 'slides');
    fs.mkdirSync(slidesDir, { recursive: true });

    const filename = `part_${safePartNumber}_slide.png`;
    const outputPath = path.join(slidesDir, filename);

    // Version existing file before overwriting
    if (fs.existsSync(outputPath)) {
      let version = 1;
      while (fs.existsSync(path.join(slidesDir, `part_${safePartNumber}_slide_v${version}.png`))) {
        version++;
      }
      fs.renameSync(outputPath, path.join(slidesDir, `part_${safePartNumber}_slide_v${version}.png`));
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
      path: `/api/assets/${encodeURIComponent(safeProject)}/slides/${encodeURIComponent(filename)}`
    });

  } catch (e) {
    console.error('Slide generation error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

const TEMPLATE_SCHEMAS = {
  text_slide: 'Схема: {"text": string (короткая ударная фраза, ≤40 символов), "subtitle": string (уточнение, ≤60 символов, опц.)}',
  infographic: 'Схема: {"title": string (≤40 символов), "items": [{"icon": строка-эмодзи, "value": string (цифра/метрика, ≤6 символов), "label": string (≤40 символов), "progress": number 0-100 (опц.)}]} — 2-4 items',
  comparison: 'Схема: {"left_title": string (≤15 символов), "right_title": string (≤15 символов), "left_items": [string, ≤30 символов each, 3-4 шт.], "right_items": [string, ≤30 символов each, 3-4 шт.]}',
  mockup: 'Схема: {"title": string (≤40 символов), "columns": [string, ≤15 символов, 2-4 шт.], "rows": [{"cells": [string, ≤15 символов, столько же сколько columns]}, 2-4 шт.]}'
};

// POST /api/ai-slide-data — generate meaningful slide_data from the part text via Claude.
router.post('/ai-slide-data', async (req, res) => {
  const { project, part_number, template } = req.body;
  if (!project || !part_number || !template) {
    return res.status(400).json({ error: 'Missing: project, part_number, template' });
  }
  let safeProject;
  try {
    safeProject = assertSafeProjectName(project);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const safePartNumber = Number(part_number);
  if (!Number.isInteger(safePartNumber) || safePartNumber < 1 || safePartNumber > 99) {
    return res.status(400).json({ error: 'part_number must be an integer between 1 and 99' });
  }
  const tmplKey = template.replace('-', '_');
  if (!TEMPLATE_SCHEMAS[tmplKey]) {
    return res.status(400).json({ error: `Unknown template: ${template}` });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const scriptPath = path.join(PROJECTS_DIR, safeProject, '02_script.json');
    if (!fs.existsSync(scriptPath)) return res.status(404).json({ error: 'Script not found' });
    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
    const part = script.parts.find(p => p.part_number === safePartNumber);
    if (!part) return res.status(404).json({ error: `Part ${safePartNumber} not found` });

    const userPrompt = `Ты генерируешь JSON-данные для HTML-слайда в Instagram Reels.
Автор произносит эту фразу на камеру: "${part.text}"
Утверждение, которое нужно визуально подкрепить (claim): "${part.claim || '—'}"
Что зритель должен увидеть как доказательство (visual_proof): "${part.visual_proof || '—'}"
Язык слайда: ${script.language || 'ru'}.

Шаблон: ${tmplKey}
${TEMPLATE_SCHEMAS[tmplKey]}

Правила:
- Данные должны быть логически связаны с произносимой фразой.
- Используй короткие фразы, которые помещаются на экране 1080×1920.
- Если шаблон infographic — используй реалистичные/правдоподобные цифры.
- Иконки-эмодзи должны соответствовать смыслу пункта.
- Отвечай СТРОГО валидным JSON-объектом, без markdown-обёрток, без комментариев, без пояснений.`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1500,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Claude API error:', errText);
      return res.status(500).json({ error: 'AI request failed' });
    }

    const data = await resp.json();
    let text = data.content?.[0]?.text?.trim() || '';
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let slideData;
    try {
      slideData = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'AI returned non-JSON: ' + e.message });
    }

    res.json({ success: true, slide_data: slideData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
