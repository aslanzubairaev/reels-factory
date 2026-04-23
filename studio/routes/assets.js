const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { assertSafeProjectName } = require('../lib/projects');
const {
  assertSafeAssetFileName,
  getProjectAssetsDir,
  isBackgroundAssetFileName,
  isCustomAssetFileName,
  isSlideAssetFileName
} = require('../lib/project-assets');

function sendProjectAsset(res, { projectName, assetKind, fileName, notFoundMessage }) {
  const filePath = path.join(getProjectAssetsDir(projectName, assetKind), fileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: notFoundMessage });
    return;
  }

  res.sendFile(path.resolve(filePath));
}

function getRouteErrorStatus(error) {
  return error.message === 'Invalid project name' || error.message === 'Invalid asset file name'
    ? 400
    : 500;
}

// GET /api/assets/:project/custom/:file — serve custom user-uploaded backgrounds
router.get('/assets/:project/custom/:file', (req, res) => {
  try {
    sendProjectAsset(res, {
      projectName: assertSafeProjectName(req.params.project),
      assetKind: 'custom',
      fileName: assertSafeAssetFileName(req.params.file, isCustomAssetFileName),
      notFoundMessage: 'Custom asset not found'
    });
  } catch (err) {
    res.status(getRouteErrorStatus(err)).json({ error: err.message });
  }
});

// GET /api/assets/:project/slides/:file — serve HTML slide PNG files
// Must be before the generic :file route to avoid matching "slides" as filename
router.get('/assets/:project/slides/:file', (req, res) => {
  try {
    sendProjectAsset(res, {
      projectName: assertSafeProjectName(req.params.project),
      assetKind: 'slides',
      fileName: assertSafeAssetFileName(req.params.file, isSlideAssetFileName),
      notFoundMessage: 'Slide not found'
    });
  } catch (err) {
    res.status(getRouteErrorStatus(err)).json({ error: err.message });
  }
});

// GET /api/assets/:project/:file — serve background files
router.get('/assets/:project/:file', (req, res) => {
  try {
    sendProjectAsset(res, {
      projectName: assertSafeProjectName(req.params.project),
      assetKind: 'backgrounds',
      fileName: assertSafeAssetFileName(req.params.file, isBackgroundAssetFileName),
      notFoundMessage: 'Asset not found'
    });
  } catch (err) {
    res.status(getRouteErrorStatus(err)).json({ error: err.message });
  }
});

module.exports = router;
