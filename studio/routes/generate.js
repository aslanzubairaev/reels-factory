const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PROJECTS_DIR = path.join(ROOT, 'projects');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');

const BG_PROMPT_SUFFIX = ', background plate for talking head video, soft even lighting, no harsh shadows, no foreground objects, color palette compatible with indoor skin tones, 9:16 vertical portrait orientation';

// Windows ships `python`, not `python3`. Detect once at module load.
let PYTHON_BIN = null;
for (const cmd of ['python3', 'python', 'py']) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'pipe', windowsHide: true });
    PYTHON_BIN = cmd;
    break;
  } catch (_) { /* try next */ }
}
if (!PYTHON_BIN) {
  console.warn('⚠️  No Python interpreter found (tried python3, python, py). Generation endpoints will fail.');
  PYTHON_BIN = 'python3';
}

/**
 * Auto-translate prompt to English via Claude API
 */
async function translatePrompt(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) {
    // No API key — return prompt as-is (assume it's already English)
    return prompt;
  }

  // Check if prompt is already English (simple heuristic)
  const nonAscii = prompt.replace(/[a-zA-Z0-9\s.,!?'":\-;()@#$%^&*=+/\\|{}\[\]<>~`]/g, '');
  if (nonAscii.length === 0) {
    return prompt; // Already English
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Translate the following image generation prompt to English. Keep technical terms (aspect ratio, depth of field, bokeh, cinematic, 4K, etc.) unchanged. Output ONLY the translated prompt, nothing else.\n\nPrompt: ${prompt}`
        }]
      })
    });

    if (!response.ok) {
      console.warn('Translation API error, using original prompt');
      return prompt;
    }

    const data = await response.json();
    const translated = data.content?.[0]?.text?.trim();
    return translated || prompt;
  } catch (e) {
    console.warn('Translation failed, using original prompt:', e.message);
    return prompt;
  }
}

// POST /api/generate — generate background from prompt (with auto-translation)
router.post('/generate', async (req, res) => {
  const { project, part_number, prompt, type, duration, video_service } = req.body;

  if (!project || !part_number || !prompt || !type) {
    return res.status(400).json({
      error: 'Missing required fields: project, part_number, prompt, type'
    });
  }

  if (!['photo', 'video'].includes(type)) {
    return res.status(400).json({ error: 'type must be "photo" or "video"' });
  }

  try {
    // Step 1: Auto-translate prompt to English
    let englishPrompt = await translatePrompt(prompt);

    // Step 2: Add mandatory background suffixes if not already present
    if (!englishPrompt.includes('background plate')) {
      englishPrompt += BG_PROMPT_SUFFIX;
    }

    // Step 3: Prepare paths
    const bgDir = path.join(PROJECTS_DIR, project, 'assets', 'backgrounds');
    fs.mkdirSync(bgDir, { recursive: true });

    const ext = type === 'photo' ? 'jpg' : 'mp4';
    const filename = `part_${part_number}_bg.${ext}`;
    const outputPath = path.join(bgDir, filename);

    // Version existing file before overwriting
    if (fs.existsSync(outputPath)) {
      let version = 1;
      while (fs.existsSync(path.join(bgDir, `part_${part_number}_bg_v${version}.${ext}`))) {
        version++;
      }
      fs.renameSync(outputPath, path.join(bgDir, `part_${part_number}_bg_v${version}.${ext}`));
    }

    // Step 4: Choose script
    let script;
    if (type === 'photo') {
      script = path.join(SKILLS_DIR, 'generate-photo', 'generate_photo.py');
    } else {
      script = video_service === 'seedance'
        ? path.join(SKILLS_DIR, 'generate-video', 'generate_seedance.py')
        : path.join(SKILLS_DIR, 'generate-video', 'generate_veo.py');
    }

    const args = ['--prompt', englishPrompt, '--output', outputPath];
    if (type === 'video' && duration) {
      args.push('--duration', String(duration));
    }

    // Step 5: Execute generation
    // Only pass required env vars to child process — not the entire environment
    const env = {
      PATH: process.env.PATH,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      PIAPI_KEY: process.env.PIAPI_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      PYTHONIOENCODING: 'utf-8'
    };

    execFile(PYTHON_BIN, [script, ...args], { timeout: 300000, env }, (error, stdout, stderr) => {
      if (error) {
        console.error('Generation error:', stderr || error.message);

        let userError = 'Generation failed';
        const errText = (stderr || error.message || '').toLowerCase();
        if (errText.includes('billing') || errText.includes('403')) {
          userError = 'Billing required. Enable billing in Google Cloud Console for image generation.';
        } else if (errText.includes('api_key') || errText.includes('not set')) {
          userError = 'API key not configured. Check your .env file.';
        } else if (errText.includes('timeout')) {
          userError = 'Generation timed out. Try again.';
        }

        // Log full error server-side only — never expose stderr to client (may contain API keys)
        console.error('Full error details:', stderr || error.message);
        return res.status(500).json({ error: userError });
      }

      // Step 6: Resize after generation
      const resizeScript = path.join(SKILLS_DIR, 'resize-asset', 'resize.py');
      const resizeArgs = ['--input', outputPath];
      if (type === 'video' && duration) {
        resizeArgs.push('--duration', String(duration));
      }

      execFile(PYTHON_BIN, [resizeScript, ...resizeArgs], { timeout: 120000, env }, (resizeErr) => {
        if (resizeErr) {
          console.error('Resize error:', resizeErr.message);
        }

        res.json({
          success: true,
          file: filename,
          path: `/api/assets/${project}/${filename}`,
          translated_prompt: englishPrompt
        });
      });
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
