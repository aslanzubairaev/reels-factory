#!/usr/bin/env node
/**
 * Generate HTML Slide — renders an HTML template with data into a 1080x1920 PNG.
 * Uses Puppeteer to render the template in a headless browser.
 *
 * Usage:
 *   node generate_slide.js --template infographic --data '{"title":"..."}' --output path/to/output.png
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--template' && argv[i + 1]) args.template = argv[++i];
    else if (argv[i] === '--data' && argv[i + 1]) args.data = argv[++i];
    else if (argv[i] === '--output' && argv[i + 1]) args.output = argv[++i];
  }
  return args;
}

async function generateSlide(templateName, slideData, outputPath) {
  const TEMPLATES_DIR = path.join(__dirname, '..', '..', '..', 'studio', 'templates');
  const templateFile = path.join(TEMPLATES_DIR, `${templateName}.html`);

  if (!fs.existsSync(templateFile)) {
    throw new Error(`Template not found: ${templateFile}`);
  }

  let html = fs.readFileSync(templateFile, 'utf-8');

  // Inject slide data as window.__SLIDE_DATA__ before any script execution
  const dataScript = `<script>window.__SLIDE_DATA__ = ${JSON.stringify(slideData)};</script>`;
  html = html.replace('<script>', dataScript + '\n<script>');

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // W-015: viewport must be exactly 1080x1920
    await page.setViewport({ width: 1080, height: 1920 });

    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);

    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: { x: 0, y: 0, width: 1080, height: 1920 }
    });

    console.log(`Slide generated: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.template || !args.data || !args.output) {
    console.error('Usage: node generate_slide.js --template <name> --data <json> --output <path>');
    process.exit(1);
  }

  let slideData;
  try {
    slideData = JSON.parse(args.data);
  } catch (e) {
    console.error('Invalid JSON data:', e.message);
    process.exit(1);
  }

  try {
    await generateSlide(args.template, slideData, args.output);
  } catch (e) {
    console.error('Generation failed:', e.message);
    process.exit(1);
  }
}

main();
