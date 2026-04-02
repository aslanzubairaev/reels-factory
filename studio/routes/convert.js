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

// POST /api/record/concatenate — concatenate per_part recordings into one file
router.post('/record/concatenate', (req, res) => {
  const { project } = req.body;

  if (!project) {
    return res.status(400).json({ error: 'Missing required field: project' });
  }

  const outputDir = path.join(PROJECTS_DIR, project, 'output');

  // Security: prevent directory traversal
  const resolvedDir = path.resolve(outputDir);
  if (!resolvedDir.startsWith(path.resolve(PROJECTS_DIR))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(outputDir)) {
    return res.status(404).json({ error: 'Output directory not found' });
  }

  // Find all recording_part_*.mp4 files, sorted by part number
  const partFiles = fs.readdirSync(outputDir)
    .filter(f => /^recording_part_\d+\.mp4$/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/recording_part_(\d+)/)[1]);
      const numB = parseInt(b.match(/recording_part_(\d+)/)[1]);
      return numA - numB;
    });

  if (partFiles.length === 0) {
    return res.status(404).json({ error: 'No recording_part_*.mp4 files found' });
  }

  if (partFiles.length === 1) {
    // Only one part — just rename/copy it
    const src = path.join(outputDir, partFiles[0]);
    const dest = path.join(outputDir, 'recording_full.mp4');
    fs.copyFileSync(src, dest);
    return res.json({
      success: true,
      file: 'recording_full.mp4',
      parts: partFiles.length
    });
  }

  // Create concat list file for FFmpeg
  const listPath = path.join(outputDir, '_concat_list.txt');
  const listContent = partFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, listContent, 'utf-8');

  const outputPath = path.join(outputDir, 'recording_full.mp4');
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  execFile(ffmpegPath, [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath
  ], { timeout: 300000, windowsHide: true, cwd: outputDir }, (error, stdout, stderr) => {
    // Clean up concat list
    try { fs.unlinkSync(listPath); } catch (e) { /* ignore */ }

    if (error) {
      console.error('FFmpeg concat error:', stderr || error.message);
      return res.status(500).json({
        error: 'Concatenation failed',
        details: stderr || error.message
      });
    }

    res.json({
      success: true,
      file: 'recording_full.mp4',
      parts: partFiles.length,
      partFiles: partFiles
    });
  });
});

module.exports = router;
