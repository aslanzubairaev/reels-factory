const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { assertSafeProjectName } = require('../lib/projects');
const {
  UPLOAD_TYPE_MAP,
  assertValidPartNumber,
  ensureProjectAssetsDir,
  getProjectAssetsDir,
  getUploadInfoForMimeType,
  listPartCustomFiles
} = require('../lib/project-assets');

const ALLOWED_TYPES = Array.from(UPLOAD_TYPE_MAP.keys());

// Upload to temp dir first, then move to correct location
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: jpg, png, webp, mp4, webm, mov`));
    }
  }
});

// POST /api/upload-background — upload custom background for a part
router.post('/upload-background', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.body.project || !req.body.part_number) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing project or part_number' });
    }

    const projectName = assertSafeProjectName(req.body.project);
    const partNumber = assertValidPartNumber(req.body.part_number);
    const uploadInfo = getUploadInfoForMimeType(req.file.mimetype);

    if (!uploadInfo) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `Unsupported file type: ${req.file.mimetype}` });
    }

    const filename = `part_${partNumber}${uploadInfo.ext}`;

    const customDir = ensureProjectAssetsDir(projectName, 'custom');

    for (const existingFile of listPartCustomFiles(projectName, partNumber)) {
      fs.unlinkSync(path.join(customDir, existingFile));
    }

    const finalPath = path.join(customDir, filename);
    fs.renameSync(req.file.path, finalPath);

    res.json({
      success: true,
      file: filename,
      type: uploadInfo.type,
      path: `/api/assets/${projectName}/custom/${filename}`
    });
  } catch (e) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const statusCode = e.message === 'Invalid project name' || e.message === 'Invalid part_number'
      ? 400
      : 500;

    res.status(statusCode).json({ error: e.message });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// DELETE /api/upload-background — remove custom background
router.delete('/upload-background', (req, res) => {
  try {
    const project = req.body?.project;
    const partNumber = req.body?.part_number;

    if (!project || !partNumber) {
      return res.status(400).json({ error: 'Missing project or part_number' });
    }

    const projectName = assertSafeProjectName(project);
    const normalizedPartNumber = assertValidPartNumber(partNumber);
    const customDir = getProjectAssetsDir(projectName, 'custom');

    if (!fs.existsSync(customDir)) {
      return res.json({ success: true, message: 'No custom files' });
    }

    let deleted = false;
    for (const fileName of listPartCustomFiles(projectName, normalizedPartNumber)) {
      fs.unlinkSync(path.join(customDir, fileName));
      deleted = true;
    }

    res.json({ success: true, deleted });
  } catch (e) {
    const statusCode = e.message === 'Invalid project name' || e.message === 'Invalid part_number'
      ? 400
      : 500;
    res.status(statusCode).json({ error: e.message });
  }
});

module.exports = router;
