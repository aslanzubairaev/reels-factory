const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'projects');

// GET /api/assets/:project/custom/:file — serve custom user-uploaded backgrounds
router.get('/assets/:project/custom/:file', (req, res) => {
  try {
    const filePath = path.join(
      PROJECTS_DIR,
      req.params.project,
      'assets',
      'custom',
      req.params.file
    );

    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(PROJECTS_DIR))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Custom asset not found' });
    }

    res.sendFile(resolved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assets/:project/slides/:file — serve HTML slide PNG files
// Must be before the generic :file route to avoid matching "slides" as filename
router.get('/assets/:project/slides/:file', (req, res) => {
  try {
    const filePath = path.join(
      PROJECTS_DIR,
      req.params.project,
      'assets',
      'slides',
      req.params.file
    );

    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(PROJECTS_DIR))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Slide not found' });
    }

    res.sendFile(resolved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assets/:project/:file — serve background files
router.get('/assets/:project/:file', (req, res) => {
  try {
    const filePath = path.join(
      PROJECTS_DIR,
      req.params.project,
      'assets',
      'backgrounds',
      req.params.file
    );

    // Security: prevent directory traversal
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(PROJECTS_DIR))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.sendFile(resolved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
