const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { getRecordingOutputDir, getRecordingPath } = require('../lib/recordings');
const { assertSafeProjectName } = require('../lib/projects');

// POST /api/record/convert — convert WebM to MP4
router.post('/record/convert', (req, res) => {
  const project = req.body?.project;
  const filename = req.body?.filename;

  if (!project || !filename) {
    return res.status(400).json({
      error: 'Missing required fields: project, filename'
    });
  }

  let projectName;
  let inputPath;
  let outputDir;

  try {
    projectName = assertSafeProjectName(project);
    outputDir = getRecordingOutputDir(projectName);
    inputPath = getRecordingPath(projectName, filename, { allowWebm: true, allowMp4: false });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const outputFilename = filename.replace(/\.\w+$/, '.mp4');
  const outputPath = path.join(outputDir, outputFilename);

  // Принудительный CFR 30fps + async-выравнивание аудио — критично для концатенации
  // сегментов без дрейфа синхрона. MediaRecorder пишет VFR, без этого шага
  // последующий concat порождает «видео отстаёт от голоса».
  execFile('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-vsync', 'cfr',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-af', 'aresample=async=1:first_pts=0',
    '-movflags', '+faststart',
    outputPath
  ], { timeout: 300000 }, (error, stdout, stderr) => {
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
