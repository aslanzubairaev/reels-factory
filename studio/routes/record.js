const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readProjectMeta, readProjectScript, touchProjectMeta } = require('../lib/projects');
const { getHistoryPath, getProjectsDir } = require('../lib/runtime-paths');
const {
  getRecordingOutputDir,
  getRecordingUploadExtension,
  resolveRecordingBaseName
} = require('../lib/recordings');

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const project = req.body.project || req.query.project;
    if (!project) {
      return cb(new Error('Missing project name'));
    }

    try {
      cb(null, getRecordingOutputDir(project));
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    try {
      const project = req.body.project || req.query.project;
      if (!project) {
        throw new Error('Missing project name');
      }
      const name = resolveRecordingBaseName(project, req.body.filename || req.query.filename);
      const ext = getRecordingUploadExtension(file.mimetype, file.originalname);
      cb(null, name + ext);
    } catch (error) {
      cb(error);
    }
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
      try {
        touchProjectMeta(project, { status: 'recorded' });
      } catch (e) {
        console.error('Failed to update project meta:', e.message);
      }
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

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err && (
    err.message === 'Invalid project name' ||
    err.message === 'Invalid recording filename' ||
    err.message === 'Missing project name' ||
    err.message === 'No available recording filename' ||
    err.message.startsWith('Unsupported recording type:')
  )) {
    return res.status(400).json({ error: err.message });
  }

  next(err);
});

/**
 * Add a project to history.json
 */
function addToHistory(projectName) {
  try {
    const historyPath = getHistoryPath();
    const projectsDir = getProjectsDir();
    // Read existing history
    let history = { projects: [] };
    if (fs.existsSync(historyPath)) {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    }

    // Check if already recorded
    if (history.projects.some(p => p.name === projectName)) {
      return; // Already in history
    }

    // Read script for metadata
    const script = readProjectScript(projectName);
    const meta = readProjectMeta(projectName, script);

    // Read trend for idea text
    const trendPath = path.join(projectsDir, projectName, '01_trend.md');
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
      source_mode: meta.source_mode,
      status: 'completed'
    });

    // Save
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    console.log(`History updated: ${projectName}`);
  } catch (e) {
    console.error('Failed to update history:', e.message);
  }
}

module.exports = router;
