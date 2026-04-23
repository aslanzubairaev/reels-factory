const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { getProjectsDir } = require('./runtime-paths');

const VALID_LAYOUTS = new Set(['full_background', 'face_only']);
const VALID_BACKGROUND_TYPES = new Set(['photo', 'video', 'html_slide', 'screen_capture', 'none']);
const VALID_SOURCE_MODES = new Set(['classic', 'studio']);
const VALID_STATUSES = new Set(['draft', 'ready', 'recorded']);
const VALID_CAMERA_SHAPES = new Set(['rounded-rect', 'circle']);
const VALID_TRANSITIONS = new Set(['fade', 'slide', 'zoom', 'cut']);
const VALID_CLICK_ANIMATIONS = new Set(['none', 'pulse', 'rings', 'spark', 'target', 'glow']);

const DEFAULT_STUDIO_PREFERENCES = {
  camera_shape: 'rounded-rect',
  transition: 'fade',
  click_animation: 'pulse',
  cam_size: 1,
  camera_placement: { x: 0.5, y: 0.9 }
};

function isSafeProjectName(name) {
  return typeof name === 'string' &&
    name.trim() !== '' &&
    !name.includes('..') &&
    !/[\\/]/.test(name);
}

function assertSafeProjectName(name) {
  if (!isSafeProjectName(name)) {
    throw new Error('Invalid project name');
  }
  return name.trim();
}

function getProjectDir(projectName) {
  return path.join(getProjectsDir(), assertSafeProjectName(projectName));
}

function getScriptPath(projectName) {
  return path.join(getProjectDir(projectName), '02_script.json');
}

function getMetaPath(projectName) {
  return path.join(getProjectDir(projectName), 'project.meta.json');
}

function getPreferencesPath(projectName) {
  return path.join(getProjectDir(projectName), 'studio.preferences.json');
}

function ensureProjectStructure(projectName) {
  const projectDir = getProjectDir(projectName);
  fs.mkdirSync(path.join(projectDir, 'assets', 'backgrounds'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'assets', 'custom'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'assets', 'slides'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'output'), { recursive: true });
  return projectDir;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, value) {
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(dirPath, `.${path.basename(filePath)}.${process.pid}.tmp`);
  const payload = JSON.stringify(value, null, 2) + '\n';

  fs.mkdirSync(dirPath, { recursive: true });

  try {
    fs.writeFileSync(tempPath, payload, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

function makeUniqueProjectName(displayName) {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const baseSlug = slugify(displayName) || 'studio-project';
  const projectsDir = getProjectsDir();
  let candidate = `${datePrefix}_${baseSlug}`;
  let suffix = 2;

  while (fs.existsSync(path.join(projectsDir, candidate))) {
    candidate = `${datePrefix}_${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function createGeneratedPartId() {
  return `part-${randomUUID()}`;
}

function getFallbackPartId(sourcePart, index) {
  const legacyNumber = toNonNegativeInteger(sourcePart?.part_number, index + 1) || (index + 1);
  return `legacy-part-${legacyNumber}`;
}

function claimUniquePartId(preferredPartId, fallbackPartId, usedIds) {
  const baseId = preferredPartId || fallbackPartId || 'part';
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function normalizePart(sourcePart, index, usedIds) {
  const part = sourcePart && typeof sourcePart === 'object' ? { ...sourcePart } : {};
  const rawLayout = typeof part.layout === 'string' ? part.layout.trim() : '';
  const rawBackgroundType = typeof part.background_type === 'string' ? part.background_type.trim() : '';
  const rawScreenCaptureLabel = typeof part.screen_capture_label === 'string' ? part.screen_capture_label.trim() : '';

  const layoutAliases = {
    background_and_face: 'full_background',
    background: 'full_background',
    with_background: 'full_background',
    full: 'full_background',
    no_background: 'face_only',
    talking_head: 'face_only'
  };

  const backgroundTypeAliases = {
    image: 'photo',
    picture: 'photo',
    clip: 'video',
    movie: 'video',
    '': rawLayout === 'face_only' ? 'none' : 'none'
  };

  const normalizedLayout = layoutAliases[rawLayout] || rawLayout;
  const layout = VALID_LAYOUTS.has(normalizedLayout)
    ? normalizedLayout
    : (rawBackgroundType ? 'full_background' : 'face_only');

  const normalizedBackgroundType = backgroundTypeAliases[rawBackgroundType] || rawBackgroundType;
  const resolvedBackgroundType = VALID_BACKGROUND_TYPES.has(normalizedBackgroundType)
    ? normalizedBackgroundType
    : (layout === 'face_only' ? 'none' : 'photo');
  const backgroundType = layout === 'face_only' ? 'none' : resolvedBackgroundType;
  const backgroundUrl = '';
  const screenCaptureLabel = layout === 'face_only' || backgroundType !== 'screen_capture'
    ? ''
    : (rawScreenCaptureLabel || 'Shared window');

  const requestedPartId = typeof part.part_id === 'string' ? part.part_id.trim() : '';
  const fallbackPartId = getFallbackPartId(part, index);
  const partId = claimUniquePartId(requestedPartId, fallbackPartId, usedIds);

  return {
    ...part,
    part_id: partId,
    part_number: index + 1,
    text: typeof part.text === 'string' ? part.text : '',
    layout,
    timing_seconds: toNonNegativeInteger(part.timing_seconds, 0),
    background_type: backgroundType,
    background_url: backgroundUrl,
    screen_capture_label: screenCaptureLabel,
    background_prompt: typeof part.background_prompt === 'string' ? part.background_prompt : ''
  };
}

function normalizeScript(rawScript, projectName) {
  const source = rawScript && typeof rawScript === 'object' ? { ...rawScript } : {};
  const partsInput = Array.isArray(source.parts) ? source.parts : [];
  const usedIds = new Set();
  const parts = partsInput.map((part, index) => normalizePart(part, index, usedIds));
  const totalDuration = parts.reduce((sum, part) => sum + part.timing_seconds, 0);

  return {
    ...source,
    project_name: typeof source.project_name === 'string' && source.project_name.trim()
      ? source.project_name.trim()
      : projectName,
    language: typeof source.language === 'string' && source.language.trim()
      ? source.language.trim()
      : 'ru',
    total_duration_seconds: totalDuration,
    parts
  };
}

function createDefaultScript(projectName, language = 'ru') {
  return normalizeScript({
    project_name: projectName,
    language,
    parts: [{
      part_id: createGeneratedPartId(),
      part_number: 1,
      text: '',
      layout: 'face_only',
      timing_seconds: 0,
      background_type: 'none',
      screen_capture_label: '',
      background_prompt: ''
    }]
  }, projectName);
}

function inferStatusFromScript(script) {
  return script?.parts?.length ? 'ready' : 'draft';
}

function normalizeMeta(rawMeta, projectName, script) {
  const source = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
  const now = new Date().toISOString();
  const sourceMode = VALID_SOURCE_MODES.has(source.source_mode) ? source.source_mode : 'classic';
  const status = VALID_STATUSES.has(source.status) ? source.status : inferStatusFromScript(script);

  return {
    project_name: projectName,
    source_mode: sourceMode,
    status,
    created_at: source.created_at || now,
    updated_at: source.updated_at || source.created_at || now
  };
}

function readProjectScript(projectName) {
  const scriptPath = getScriptPath(projectName);
  if (!fs.existsSync(scriptPath)) {
    return null;
  }
  return normalizeScript(readJson(scriptPath), projectName);
}

function writeProjectScript(projectName, script) {
  ensureProjectStructure(projectName);
  const normalized = normalizeScript(script, projectName);
  writeJson(getScriptPath(projectName), normalized);
  return normalized;
}

function readProjectMeta(projectName, script = undefined) {
  const metaPath = getMetaPath(projectName);
  const resolvedScript = script === undefined ? readProjectScript(projectName) : script;

  if (!fs.existsSync(metaPath)) {
    return normalizeMeta(null, projectName, resolvedScript);
  }

  return normalizeMeta(readJson(metaPath), projectName, resolvedScript);
}

function writeProjectMeta(projectName, meta, script = undefined) {
  ensureProjectStructure(projectName);
  const resolvedScript = script === undefined ? readProjectScript(projectName) : script;
  const normalized = normalizeMeta(meta, projectName, resolvedScript);
  writeJson(getMetaPath(projectName), normalized);
  return normalized;
}

function touchProjectMeta(projectName, patch = {}, script = undefined) {
  const resolvedScript = script === undefined ? readProjectScript(projectName) : script;
  const existing = readProjectMeta(projectName, resolvedScript);
  const nextMeta = {
    ...existing,
    ...patch,
    project_name: projectName,
    created_at: existing.created_at,
    updated_at: new Date().toISOString()
  };
  return writeProjectMeta(projectName, nextMeta, resolvedScript);
}

function normalizeStudioPreferences(rawPreferences = {}) {
  const source = rawPreferences && typeof rawPreferences === 'object' ? rawPreferences : {};
  const placement = source.camera_placement && typeof source.camera_placement === 'object'
    ? source.camera_placement
    : {};

  return {
    camera_shape: VALID_CAMERA_SHAPES.has(source.camera_shape)
      ? source.camera_shape
      : DEFAULT_STUDIO_PREFERENCES.camera_shape,
    transition: VALID_TRANSITIONS.has(source.transition)
      ? source.transition
      : DEFAULT_STUDIO_PREFERENCES.transition,
    click_animation: VALID_CLICK_ANIMATIONS.has(source.click_animation)
      ? source.click_animation
      : DEFAULT_STUDIO_PREFERENCES.click_animation,
    cam_size: clampNumber(
      source.cam_size,
      0.5,
      1.8,
      DEFAULT_STUDIO_PREFERENCES.cam_size
    ),
    camera_placement: {
      x: clampNumber(
        placement.x,
        0,
        1,
        DEFAULT_STUDIO_PREFERENCES.camera_placement.x
      ),
      y: clampNumber(
        placement.y,
        0,
        1,
        DEFAULT_STUDIO_PREFERENCES.camera_placement.y
      )
    }
  };
}

function readProjectPreferences(projectName) {
  const preferencesPath = getPreferencesPath(projectName);
  if (!fs.existsSync(preferencesPath)) {
    return normalizeStudioPreferences();
  }

  return normalizeStudioPreferences(readJson(preferencesPath));
}

function writeProjectPreferences(projectName, preferences) {
  ensureProjectStructure(projectName);
  const normalized = normalizeStudioPreferences(preferences);
  writeJson(getPreferencesPath(projectName), normalized);
  return normalized;
}

function createProjectDraft({ displayName, language = 'ru', sourceMode = 'studio', initialScript = null } = {}) {
  const projectName = makeUniqueProjectName(displayName);
  const script = writeProjectScript(projectName, initialScript || createDefaultScript(projectName, language));
  const meta = writeProjectMeta(projectName, {
    project_name: projectName,
    source_mode: VALID_SOURCE_MODES.has(sourceMode) ? sourceMode : 'studio',
    status: 'draft'
  }, script);

  return { projectName, script, meta };
}

function listProjectNames() {
  const projectsDir = getProjectsDir();
  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && isSafeProjectName(entry.name))
    .map(entry => entry.name);
}

module.exports = {
  assertSafeProjectName,
  createDefaultScript,
  createProjectDraft,
  getProjectsDir,
  getMetaPath,
  getPreferencesPath,
  getProjectDir,
  getScriptPath,
  listProjectNames,
  normalizeStudioPreferences,
  readProjectPreferences,
  normalizeScript,
  readProjectMeta,
  readProjectScript,
  touchProjectMeta,
  writeProjectMeta,
  writeProjectPreferences,
  writeProjectScript
};
