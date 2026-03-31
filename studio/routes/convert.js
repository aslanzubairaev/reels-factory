const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'projects');

// POST /api/record/convert — convert WebM to MP4
router.post('/record/convert', (req, res) => {
  const { project, filename } = req.body;

  if (!project || !filename) {
    return res.status(400).json({
      error: 'Missing required fields: project, filename'
    });
  }

  const outputDir = path.join(PROJECTS_DIR, project, 'output');
  const inputPath = path.join(outputDir, filename);

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Security: prevent directory traversal
  const resolved = path.resolve(inputPath);
  if (!resolved.startsWith(path.resolve(PROJECTS_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const outputFilename = filename.replace(/\.\w+$/, '.mp4');
  const outputPath = path.join(outputDir, outputFilename);

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  execFile(ffmpegPath, [
    '-y',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    outputPath
  ], { timeout: 300000, windowsHide: true }, (error, stdout, stderr) => {
    if (error) {
      console.error('FFmpeg error:', stderr || error.message);
      return res.status(500).json({
        error: 'Conversion failed',
        details: stderr || error.message
      });
    }

    // Remove original WebM if conversion succeeded
    if (inputPath !== outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(inputPath);
    }

    res.json({
      success: true,
      file: outputFilename,
      path: outputPath
    });
  });
});

module.exports = router;
