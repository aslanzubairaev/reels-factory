const path = require('path');

const APP_ROOT = path.join(__dirname, '..', '..');

function resolveOverride(value) {
  return value ? path.resolve(value) : null;
}

function getAppRoot() {
  return APP_ROOT;
}

function getProjectsDir() {
  return resolveOverride(process.env.REELS_FACTORY_PROJECTS_DIR) || path.join(APP_ROOT, 'projects');
}

function getHistoryPath() {
  return resolveOverride(process.env.REELS_FACTORY_HISTORY_PATH) || path.join(APP_ROOT, 'history', 'history.json');
}

function getScriptsDir() {
  return path.join(APP_ROOT, 'utils');
}

function getValidateScriptPath() {
  return path.join(getScriptsDir(), 'validate_script.py');
}

function getTemplatesDir() {
  return path.join(APP_ROOT, 'studio', 'templates');
}

module.exports = {
  getAppRoot,
  getHistoryPath,
  getProjectsDir,
  getScriptsDir,
  getTemplatesDir,
  getValidateScriptPath
};
