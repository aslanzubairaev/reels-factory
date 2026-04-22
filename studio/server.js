const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getProjectsDir } = require('./lib/runtime-paths');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

// Middleware
// Restrict CORS to localhost only
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: false
}));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Static files — studio frontend.
// Disable HTTP caching so JS/CSS updates are picked up immediately on reload.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.set('Cache-Control', 'no-store, must-revalidate')
}));

// xterm.js и addon-файлы — раздаём из node_modules под /vendor/xterm.
app.use('/vendor/xterm', express.static(path.join(__dirname, '..', 'node_modules', '@xterm')));

// Validate project name — block path traversal
app.use('/api', (req, res, next) => {
  const project = req.body?.project || req.query?.project || req.params?.name;
  if (project && (/\.\./.test(project) || /[/\\]/.test(project))) {
    return res.status(400).json({ error: 'Invalid project name' });
  }
  next();
});

// Routes
app.use('/api', require('./routes/project'));
app.use('/api', require('./routes/assets'));
app.use('/api', require('./routes/generate'));
app.use('/api', require('./routes/record'));
app.use('/api', require('./routes/convert'));
app.use('/api', require('./routes/slide'));
app.use('/api', require('./routes/upload'));

// Root — serve index.html
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('<h1>Reels Factory Studio</h1><p>Frontend not yet created.</p>');
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: err.message });
});

// Check FFmpeg at startup
const { execSync } = require('child_process');
let ffmpegAvailable = false;
try {
  const ffmpegVersion = execSync('ffmpeg -version', { stdio: 'pipe', windowsHide: true }).toString().split('\n')[0];
  ffmpegAvailable = true;
  console.log(`FFmpeg: ${ffmpegVersion}`);
} catch (e) {
  console.warn('⚠️  WARNING: FFmpeg not found in PATH. Video conversion and concatenation will NOT work.');
  console.warn('   Install: choco install ffmpeg (Windows) | brew install ffmpeg (macOS) | apt install ffmpeg (Ubuntu)');
}

// Expose FFmpeg status via API
app.get('/api/status/ffmpeg', (req, res) => {
  res.json({ available: ffmpegAvailable });
});

app.listen(PORT, () => {
  console.log(`Reels Factory Studio running at http://localhost:${PORT}`);
  console.log(`Projects directory: ${getProjectsDir()}`);
});
