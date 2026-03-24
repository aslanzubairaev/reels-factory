const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const PROJECTS_DIR = path.join(ROOT, 'projects');
const HISTORY_PATH = path.join(ROOT, 'history', 'history.json');

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const project = req.body.project || req.query.project;
    if (!project) {
      return cb(new Error('Missing project name'));
    }

    const outputDir = path.join(PROJECTS_DIR, project, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    cb(null, outputDir);
  },
  filename: (req, file, cb) => {
    const name = req.body.filename || req.query.filename || 'recording_full';
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, name + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// POST /api/record/save — save recorded video
router.post('/record/save', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file received' });
    }

    // Add to history
    const project = req.body.project || req.query.project;
    if (project) {
      addToHistory(project);
    }

    res.json({
      success: true,
      file: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Add a project to history.json
 */
function addToHistory(projectName) {
  try {
    // Read existing history
    let history = { projects: [] };
    if (fs.existsSync(HISTORY_PATH)) {
      history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
    }

    // Check if already recorded
    if (history.projects.some(p => p.name === projectName)) {
      return; // Already in history
    }

    // Read script for metadata
    const scriptPath = path.join(PROJECTS_DIR, projectName, '02_script.json');
    let script = null;
    if (fs.existsSync(scriptPath)) {
      script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
    }

    // Read trend for idea text
    const trendPath = path.join(PROJECTS_DIR, projectName, '01_trend.md');
    let idea = '';
    if (fs.existsSync(trendPath)) {
      const trendContent = fs.readFileSync(trendPath, 'utf-8');
      // Extract first heading after "##"
      const match = trendContent.match(/^##\s+(.+)$/m);
      if (match) {
        idea = match[1].replace(/\*\*/g, '').trim();
      }
    }

    // Extract date from project name (YYYY-MM-DD_name)
    const dateMatch = projectName.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

    // Add entry
    history.projects.push({
      name: projectName,
      date: date,
      idea: idea,
      language: script?.language || '',
      parts_count: script?.parts?.length || 0,
      total_duration: script?.total_duration_seconds || 0,
      status: 'completed'
    });

    // Save
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
    console.log(`History updated: ${projectName}`);
  } catch (e) {
    console.error('Failed to update history:', e.message);
  }
}

module.exports = router;
