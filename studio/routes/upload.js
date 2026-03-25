const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'projects');

function guessExt(mimetype) {
  if (mimetype.startsWith('image/jpeg')) return '.jpg';
  if (mimetype.startsWith('image/png')) return '.png';
  if (mimetype.startsWith('image/webp')) return '.webp';
  if (mimetype.startsWith('video/mp4')) return '.mp4';
  if (mimetype.startsWith('video/webm')) return '.webm';
  if (mimetype.startsWith('video/quicktime')) return '.mov';
  return '.bin';
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime'
];

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

    const project = req.body.project;
    const partNumber = req.body.part_number;

    if (!project || !partNumber) {
      // Clean up temp file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing project or part_number' });
    }

    // Determine extension from original filename or mimetype
    const ext = path.extname(req.file.originalname).toLowerCase() || guessExt(req.file.mimetype);
    const filename = `part_${partNumber}${ext}`;

    // Prepare destination
    const customDir = path.join(PROJECTS_DIR, project, 'assets', 'custom');
    fs.mkdirSync(customDir, { recursive: true });

    // Remove any existing custom file for this part
    const existing = fs.readdirSync(customDir);
    for (const f of existing) {
      if (f.match(new RegExp(`^part_${partNumber}\\.`))) {
        fs.unlinkSync(path.join(customDir, f));
      }
    }

    // Move from temp to final location
    const finalPath = path.join(customDir, filename);
    fs.renameSync(req.file.path, finalPath);

    const isVideo = req.file.mimetype.startsWith('video/');

    res.json({
      success: true,
      file: filename,
      type: isVideo ? 'video' : 'photo',
      path: `/api/assets/${project}/custom/${filename}`
    });
  } catch (e) {
    // Clean up temp file on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: e.message });
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
    const { project, part_number } = req.body;
    if (!project || !part_number) {
      return res.status(400).json({ error: 'Missing project or part_number' });
    }

    const customDir = path.join(PROJECTS_DIR, project, 'assets', 'custom');
    if (!fs.existsSync(customDir)) {
      return res.json({ success: true, message: 'No custom files' });
    }

    const files = fs.readdirSync(customDir);
    const prefix = `part_${part_number}.`;
    let deleted = false;
    for (const f of files) {
      if (f.startsWith(prefix)) {
        fs.unlinkSync(path.join(customDir, f));
        deleted = true;
      }
    }

    res.json({ success: true, deleted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
