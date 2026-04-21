const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'projects');

// GET /api/projects — list all projects
router.get('/projects', (req, res) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return res.json({ projects: [] });
    }

    const projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const scriptPath = path.join(PROJECTS_DIR, d.name, '02_script.json');
        let script = null;
        if (fs.existsSync(scriptPath)) {
          try {
            script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
          } catch (e) { /* ignore parse errors */ }
        }
        return {
          name: d.name,
          has_script: !!script,
          language: script?.language || null,
          total_duration: script?.total_duration_seconds || null,
          parts_count: script?.parts?.length || 0
        };
      })
      .sort((a, b) => b.name.localeCompare(a.name));

    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/project/:name — project data (script.json)
router.get('/project/:name', (req, res) => {
  try {
    const projectDir = path.join(PROJECTS_DIR, req.params.name);
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const scriptPath = path.join(projectDir, '02_script.json');
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: 'Script not found for this project' });
    }

    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));

    // Check which backgrounds exist — priority: custom/ > backgrounds/ > slides/
    const customDir = path.join(projectDir, 'assets', 'custom');
    const bgDir = path.join(projectDir, 'assets', 'backgrounds');
    const slidesDir = path.join(projectDir, 'assets', 'slides');
    const customFiles = fs.existsSync(customDir) ? fs.readdirSync(customDir) : [];
    const bgFiles = fs.existsSync(bgDir) ? fs.readdirSync(bgDir) : [];
    const slideFiles = fs.existsSync(slidesDir) ? fs.readdirSync(slidesDir) : [];

    script.parts = script.parts.map(part => {
      const n = part.part_number;

      // Check custom/ for any file matching part_N.*
      const customFile = customFiles.find(f => f.match(new RegExp(`^part_${n}\\.(jpg|jpeg|png|webp|mp4|webm|mov)$`, 'i')));
      const customType = customFile && /\.(mp4|webm|mov)$/i.test(customFile) ? 'video' : 'photo';

      const jpgFile = `part_${n}_bg.jpg`;
      const mp4File = `part_${n}_bg.mp4`;
      const slideFile = `part_${n}_slide.png`;

      // Only expose a source that matches the part's declared background_type,
      // so old files left on disk from a previous type don't override the new one.
      const usesAiBg = part.background_type === 'photo' || part.background_type === 'video';
      const usesSlide = part.background_type === 'html_slide';

      return {
        ...part,
        custom_file: customFile || null,
        custom_type: customFile ? customType : null,
        background_file: usesAiBg
          ? (bgFiles.includes(jpgFile) ? jpgFile : bgFiles.includes(mp4File) ? mp4File : null)
          : null,
        slide_file: usesSlide && slideFiles.includes(slideFile) ? slideFile : null
      };
    });

    res.json(script);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_TYPES = new Set(['photo', 'video', 'html_slide', 'screen', 'none']);
const VALID_CATEGORIES = new Set(['text_slide', 'infographic', 'comparison', 'mockup']);

const SLIDE_DATA_DEFAULTS = {
  text_slide: { text: 'Новый заголовок', subtitle: 'Подзаголовок' },
  infographic: {
    title: 'Заголовок',
    items: [
      { icon: '📊', value: '100%', label: 'Описание', progress: 100 }
    ]
  },
  comparison: {
    left_title: 'До',
    right_title: 'После',
    left_items: ['Минус'],
    right_items: ['Плюс']
  },
  mockup: {
    title: 'Заголовок',
    columns: ['Колонка 1'],
    rows: [{ cells: ['Ячейка 1'] }]
  }
};

function slideDataMatchesCategory(data, category) {
  if (!data || typeof data !== 'object') return false;
  switch (category) {
    case 'text_slide':  return typeof data.text === 'string';
    case 'infographic': return typeof data.title === 'string' && Array.isArray(data.items);
    case 'comparison':  return typeof data.left_title === 'string' && typeof data.right_title === 'string'
                               && Array.isArray(data.left_items) && Array.isArray(data.right_items);
    case 'mockup':      return typeof data.title === 'string' && Array.isArray(data.rows);
    default: return false;
  }
}

// Mutates `part` in place so it is valid against the schema for `newType`.
function normalizePart(part, newType, newCategory, patch) {
  part.background_type = newType;

  if (newType === 'none') {
    part.background_prompt = '';
    part.background_prompt_display = '';
    delete part.background_category;
    delete part.slide_data;
    delete part.claim;
    delete part.visual_proof;
    part.layout = 'face_only';
  } else if (newType === 'photo' || newType === 'video') {
    part.background_prompt = typeof patch.background_prompt === 'string'
      ? patch.background_prompt
      : (part.background_prompt || '');
    delete part.background_category;
    delete part.slide_data;
    part.claim = part.claim || 'Заполните claim';
    part.visual_proof = part.visual_proof || 'Заполните visual_proof';
    if (part.layout === 'face_only') part.layout = 'full_background';
  } else if (newType === 'html_slide') {
    part.background_prompt = '';
    const cat = VALID_CATEGORIES.has(newCategory) ? newCategory
              : VALID_CATEGORIES.has(part.background_category) ? part.background_category
              : 'text_slide';
    part.background_category = cat;
    const incomingData = patch.slide_data;
    if (incomingData && slideDataMatchesCategory(incomingData, cat)) {
      part.slide_data = incomingData;
    } else if (!slideDataMatchesCategory(part.slide_data, cat)) {
      part.slide_data = JSON.parse(JSON.stringify(SLIDE_DATA_DEFAULTS[cat]));
    }
    part.claim = part.claim || 'Заполните claim';
    part.visual_proof = part.visual_proof || 'Заполните visual_proof';
    if (part.layout === 'face_only') part.layout = 'full_background';
  } else if (newType === 'screen') {
    // Live screen capture at record time — no AI prompt, no slide data.
    part.background_prompt = '';
    part.background_prompt_display = '';
    delete part.background_category;
    delete part.slide_data;
    part.claim = part.claim || 'Заполните claim';
    part.visual_proof = part.visual_proof || 'Заполните visual_proof';
    if (part.layout === 'face_only') part.layout = 'full_background';
  }

  // Apply free-text fields from patch if provided
  if (typeof patch.claim === 'string') part.claim = patch.claim;
  if (typeof patch.visual_proof === 'string') part.visual_proof = patch.visual_proof;
  if (typeof patch.background_prompt_display === 'string') part.background_prompt_display = patch.background_prompt_display;
}

// PATCH /api/project/:name/part/:n — update a single part's background config
router.patch('/project/:name/part/:n', (req, res) => {
  try {
    const projectDir = path.join(PROJECTS_DIR, req.params.name);
    const scriptPath = path.join(projectDir, '02_script.json');
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: 'Script not found' });
    }

    const partNum = parseInt(req.params.n, 10);
    if (!Number.isInteger(partNum) || partNum < 1) {
      return res.status(400).json({ error: 'Invalid part number' });
    }

    const patch = req.body || {};
    const newType = patch.background_type;
    if (newType !== undefined && !VALID_TYPES.has(newType)) {
      return res.status(400).json({ error: `Invalid background_type. Must be one of: ${[...VALID_TYPES].join(', ')}` });
    }
    if (patch.background_category !== undefined && !VALID_CATEGORIES.has(patch.background_category)) {
      return res.status(400).json({ error: `Invalid background_category. Must be one of: ${[...VALID_CATEGORIES].join(', ')}` });
    }

    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
    const part = script.parts.find(p => p.part_number === partNum);
    if (!part) return res.status(404).json({ error: `Part ${partNum} not found` });

    const targetType = newType || part.background_type;
    normalizePart(part, targetType, patch.background_category, patch);

    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2) + '\n', 'utf-8');

    res.json({ success: true, part });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
