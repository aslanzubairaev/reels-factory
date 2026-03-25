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

      return {
        ...part,
        custom_file: customFile || null,
        custom_type: customFile ? customType : null,
        background_file: bgFiles.includes(jpgFile) ? jpgFile :
                         bgFiles.includes(mp4File) ? mp4File : null,
        slide_file: slideFiles.includes(slideFile) ? slideFile : null
      };
    });

    res.json(script);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
