const fs = require('fs');
const path = require('path');
const { getProjectDir } = require('./projects');

const UPLOAD_TYPE_MAP = new Map([
  ['image/jpeg', { ext: '.jpg', type: 'photo' }],
  ['image/png', { ext: '.png', type: 'photo' }],
  ['image/webp', { ext: '.webp', type: 'photo' }],
  ['video/mp4', { ext: '.mp4', type: 'video' }],
  ['video/webm', { ext: '.webm', type: 'video' }],
  ['video/quicktime', { ext: '.mov', type: 'video' }]
]);

function assertValidPartNumber(value) {
  const normalized = typeof value === 'number'
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');

  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new Error('Invalid part_number');
  }

  return Number.parseInt(normalized, 10);
}

function assertSafeAssetFileName(fileName, matcher = null) {
  const normalized = typeof fileName === 'string' ? fileName.trim() : '';

  if (!normalized || normalized.includes('..') || /[\\/]/.test(normalized)) {
    throw new Error('Invalid asset file name');
  }

  if (matcher) {
    const isMatch = typeof matcher === 'function'
      ? matcher(normalized)
      : matcher.test(normalized);

    if (!isMatch) {
      throw new Error('Invalid asset file name');
    }
  }

  return normalized;
}

function getProjectAssetsDir(projectName, kind) {
  return path.join(getProjectDir(projectName), 'assets', kind);
}

function ensureProjectAssetsDir(projectName, kind) {
  const dirPath = getProjectAssetsDir(projectName, kind);
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getUploadInfoForMimeType(mimetype) {
  return UPLOAD_TYPE_MAP.get(mimetype) || null;
}

function isCustomAssetFileName(fileName) {
  return /^part_\d+\.(?:jpe?g|png|webp|mp4|webm|mov)$/i.test(fileName);
}

function isBackgroundAssetFileName(fileName) {
  return /^part_\d+_bg(?:_v\d+)?\.(?:jpg|mp4)$/i.test(fileName);
}

function isSlideAssetFileName(fileName) {
  return /^part_\d+_slide(?:_v\d+)?\.png$/i.test(fileName);
}

function listMatchingFiles(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath)
    .filter(predicate)
    .sort((left, right) => left.localeCompare(right));
}

function makePartFileMatcher(partNumber, suffix, extensions, { versioned = false } = {}) {
  const versionFragment = versioned ? '(?:_v(\\d+))?' : '';
  return new RegExp(
    `^part_${partNumber}${suffix}${versionFragment}\\.(?:${extensions.join('|')})$`,
    'i'
  );
}

function pickCanonicalOrLatestVersion(files, canonicalNames, matcher) {
  for (const canonicalName of canonicalNames) {
    const exactMatch = files.find(fileName => fileName.toLowerCase() === canonicalName.toLowerCase());
    if (exactMatch) {
      return exactMatch;
    }
  }

  let selectedFile = null;
  let selectedVersion = -1;

  for (const fileName of files) {
    const match = fileName.match(matcher);
    const version = Number.parseInt(match?.[1] || '0', 10);

    if (version > selectedVersion) {
      selectedFile = fileName;
      selectedVersion = version;
    }
  }

  return selectedFile;
}

function findPartCustomFile(projectName, partNumber) {
  const dirPath = getProjectAssetsDir(projectName, 'custom');
  const matcher = makePartFileMatcher(partNumber, '', ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm', 'mov']);
  const files = listMatchingFiles(dirPath, fileName => matcher.test(fileName));
  return files[0] || null;
}

function listPartCustomFiles(projectName, partNumber) {
  const dirPath = getProjectAssetsDir(projectName, 'custom');
  const matcher = makePartFileMatcher(partNumber, '', ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm', 'mov']);
  return listMatchingFiles(dirPath, fileName => matcher.test(fileName));
}

function findPartBackgroundFile(projectName, partNumber, backgroundType) {
  const dirPath = getProjectAssetsDir(projectName, 'backgrounds');
  const matcher = makePartFileMatcher(partNumber, '_bg', ['jpg', 'mp4'], { versioned: true });
  const files = listMatchingFiles(dirPath, fileName => matcher.test(fileName));
  const canonicalNames = backgroundType === 'video'
    ? [`part_${partNumber}_bg.mp4`, `part_${partNumber}_bg.jpg`]
    : [`part_${partNumber}_bg.jpg`, `part_${partNumber}_bg.mp4`];

  return pickCanonicalOrLatestVersion(files, canonicalNames, matcher);
}

function findPartSlideFile(projectName, partNumber) {
  const dirPath = getProjectAssetsDir(projectName, 'slides');
  const matcher = makePartFileMatcher(partNumber, '_slide', ['png'], { versioned: true });
  const files = listMatchingFiles(dirPath, fileName => matcher.test(fileName));
  return pickCanonicalOrLatestVersion(files, [`part_${partNumber}_slide.png`], matcher);
}

function getCustomAssetType(fileName) {
  return /\.(?:mp4|webm|mov)$/i.test(fileName) ? 'video' : 'photo';
}

function getPartAssetMetadata(projectName, part) {
  const partNumber = assertValidPartNumber(part?.part_number);
  const backgroundType = typeof part?.background_type === 'string' ? part.background_type : '';
  const customFile = backgroundType === 'screen_capture'
    ? null
    : findPartCustomFile(projectName, partNumber);
  const customType = customFile ? getCustomAssetType(customFile) : null;

  return {
    customFile,
    customType,
    backgroundFile: backgroundType === 'photo' || backgroundType === 'video'
      ? findPartBackgroundFile(projectName, partNumber, backgroundType)
      : null,
    slideFile: backgroundType === 'html_slide'
      ? findPartSlideFile(projectName, partNumber)
      : null
  };
}

module.exports = {
  UPLOAD_TYPE_MAP,
  assertSafeAssetFileName,
  assertValidPartNumber,
  ensureProjectAssetsDir,
  findPartBackgroundFile,
  findPartCustomFile,
  findPartSlideFile,
  getCustomAssetType,
  getPartAssetMetadata,
  getProjectAssetsDir,
  getUploadInfoForMimeType,
  isBackgroundAssetFileName,
  isCustomAssetFileName,
  isSlideAssetFileName,
  listPartCustomFiles
};
