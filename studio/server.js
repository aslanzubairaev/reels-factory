const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

// Static files — studio frontend
app.use(express.static(path.join(__dirname, 'public')));

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

// Check FFmpeg at startup (W-024)
const { execSync } = require('child_process');
try {
  execSync('ffmpeg -version', { stdio: 'pipe' });
} catch (e) {
  console.warn('WARNING: FFmpeg not found. Video conversion will not work.');
  console.warn('Install: brew install ffmpeg (macOS) | apt install ffmpeg (Ubuntu) | winget install ffmpeg (Windows)');
}

app.listen(PORT, () => {
  console.log(`Reels Factory Studio running at http://localhost:${PORT}`);
  console.log(`Projects directory: ${path.join(ROOT, 'projects')}`);
});
