const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'projects');

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
