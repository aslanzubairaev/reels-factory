const path = require('path');
const { execSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp } = require('./createApp');
const { getProjectsDir } = require('./lib/runtime-paths');

const PORT = process.env.PORT || 3000;
const app = createApp();

try {
  execSync('ffmpeg -version', { stdio: 'pipe' });
} catch (e) {
  console.warn('WARNING: FFmpeg not found. Video conversion will not work.');
  console.warn('Install: brew install ffmpeg (macOS) | apt install ffmpeg (Ubuntu) | winget install ffmpeg (Windows)');
}

app.listen(PORT, () => {
  console.log(`Reels Factory Studio running at http://localhost:${PORT}`);
  console.log(`Projects directory: ${getProjectsDir()}`);
});
