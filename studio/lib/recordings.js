const fs = require('fs');
const path = require('path');
const { getProjectDir, assertSafeProjectName } = require('./projects');

function assertSafeRecordingName(name) {
  const normalized = typeof name === 'string' ? name.trim() : '';

  if (!normalized || normalized.includes('..') || /[\\/]/.test(normalized) || /\./.test(normalized)) {
    throw new Error('Invalid recording filename');
  }

  if (!/^[a-z0-9_-]+$/i.test(normalized)) {
    throw new Error('Invalid recording filename');
  }

  return normalized;
}

function assertSafeRecordingFileName(fileName, { allowWebm = true, allowMp4 = true } = {}) {
  const normalized = typeof fileName === 'string' ? fileName.trim() : '';
  const allowedExtensions = [
    ...(allowWebm ? ['webm'] : []),
    ...(allowMp4 ? ['mp4'] : [])
  ];

  if (!normalized || normalized.includes('..') || /[\\/]/.test(normalized)) {
    throw new Error('Invalid recording filename');
  }

  if (!allowedExtensions.length) {
    throw new Error('Invalid recording filename');
  }

  const matcher = new RegExp(`^[a-z0-9_-]+\\.(?:${allowedExtensions.join('|')})$`, 'i');
  if (!matcher.test(normalized)) {
    throw new Error('Invalid recording filename');
  }

  return normalized;
}

function getRecordingUploadExtension(mimetype, originalName = '') {
  const normalizedType = String(mimetype || '').toLowerCase();
  if (normalizedType.startsWith('video/webm')) {
    return '.webm';
  }
  if (normalizedType.startsWith('video/mp4')) {
    return '.mp4';
  }

  const fallbackExt = path.extname(originalName).toLowerCase();
  if (fallbackExt === '.webm' || fallbackExt === '.mp4') {
    return fallbackExt;
  }

  throw new Error(`Unsupported recording type: ${mimetype || 'unknown'}`);
}

function getRecordingOutputDir(projectName) {
  const safeProjectName = assertSafeProjectName(projectName);
  const outputDir = path.join(getProjectDir(safeProjectName), 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function recordingFileExists(outputDir, baseName) {
  return fs.existsSync(path.join(outputDir, `${baseName}.webm`)) ||
    fs.existsSync(path.join(outputDir, `${baseName}.mp4`));
}

function getAvailableRecordingBaseName(projectName, requestedBaseName) {
  const outputDir = getRecordingOutputDir(projectName);
  const safeBaseName = assertSafeRecordingName(requestedBaseName);

  if (!recordingFileExists(outputDir, safeBaseName)) {
    return safeBaseName;
  }

  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${safeBaseName}_${String(index).padStart(3, '0')}`;
    if (!recordingFileExists(outputDir, candidate)) {
      return candidate;
    }
  }

  throw new Error('No available recording filename');
}

function getNextRecordingBaseName(projectName) {
  const outputDir = getRecordingOutputDir(projectName);
  const files = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
  const maxNumber = files.reduce((max, fileName) => {
    const match = fileName.match(/^recording_(\d{3,})\.(?:webm|mp4)$/i);
    if (!match) return max;
    return Math.max(max, Number.parseInt(match[1], 10));
  }, 0);

  for (let index = maxNumber + 1; index < 10000; index += 1) {
    const candidate = `recording_${String(index).padStart(3, '0')}`;
    if (!recordingFileExists(outputDir, candidate)) {
      return candidate;
    }
  }

  throw new Error('No available recording filename');
}

function resolveRecordingBaseName(projectName, requestedBaseName) {
  const normalized = typeof requestedBaseName === 'string' ? requestedBaseName.trim() : '';
  if (!normalized || normalized === 'auto') {
    return getNextRecordingBaseName(projectName);
  }

  return getAvailableRecordingBaseName(projectName, normalized);
}

function getRecordingPath(projectName, fileName, options) {
  return path.join(
    getRecordingOutputDir(projectName),
    assertSafeRecordingFileName(fileName, options)
  );
}

module.exports = {
  assertSafeRecordingFileName,
  assertSafeRecordingName,
  getAvailableRecordingBaseName,
  getNextRecordingBaseName,
  getRecordingOutputDir,
  getRecordingPath,
  getRecordingUploadExtension,
  resolveRecordingBaseName
};
