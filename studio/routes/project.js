const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const {
  assertSafeProjectName,
  createProjectDraft,
  getProjectsDir,
  getProjectDir,
  readProjectPreferences,
  readProjectMeta,
  readProjectScript,
  writeProjectScript,
  writeProjectPreferences,
  touchProjectMeta,
  listProjectNames
} = require('../lib/projects');
const { getPartAssetMetadata } = require('../lib/project-assets');
const { getValidateScriptPath } = require('../lib/runtime-paths');
const { getPythonCommand } = require('../lib/python');

function attachAssetMetadata(projectName, script) {
  migrateLegacyAssetAliases(projectName, script);

  return {
    ...script,
    name: projectName,
    parts: (script.parts || []).map(part => {
      const assetMetadata = getPartAssetMetadata(projectName, part);

      return {
        ...part,
        custom_file: assetMetadata.customFile,
        custom_type: assetMetadata.customType,
        background_file: assetMetadata.backgroundFile,
        slide_file: assetMetadata.slideFile
      };
    })
  };
}

function isBadRequestProjectError(message) {
  return message === 'Invalid project name' || /live background URL/i.test(message);
}

function getLegacyAliasProjectDir(projectName, script) {
  const aliasName = typeof script?.project_name === 'string' ? script.project_name.trim() : '';
  if (!aliasName || aliasName === projectName) {
    return null;
  }

  try {
    assertSafeProjectName(aliasName);
  } catch (err) {
    return null;
  }

  const aliasDir = path.join(getProjectsDir(), aliasName);
  if (!fs.existsSync(aliasDir) || !fs.statSync(aliasDir).isDirectory()) {
    return null;
  }

  if (fs.existsSync(path.join(aliasDir, '02_script.json')) || fs.existsSync(path.join(aliasDir, 'project.meta.json'))) {
    return null;
  }

  return aliasDir;
}

function migrateAssetFiles(fromDir, toDir) {
  if (!fs.existsSync(fromDir) || !fs.statSync(fromDir).isDirectory()) {
    return;
  }

  fs.mkdirSync(toDir, { recursive: true });

  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;

    const sourcePath = path.join(fromDir, entry.name);
    const targetPath = path.join(toDir, entry.name);
    if (fs.existsSync(targetPath)) continue;

    fs.renameSync(sourcePath, targetPath);
  }
}

function migrateLegacyAssetAliases(projectName, script) {
  const aliasDir = getLegacyAliasProjectDir(projectName, script);
  if (!aliasDir) {
    return;
  }

  const projectDir = getProjectDir(projectName);
  const sourceAssetsDir = path.join(aliasDir, 'assets');
  const targetAssetsDir = path.join(projectDir, 'assets');

  migrateAssetFiles(path.join(sourceAssetsDir, 'custom'), path.join(targetAssetsDir, 'custom'));
  migrateAssetFiles(path.join(sourceAssetsDir, 'backgrounds'), path.join(targetAssetsDir, 'backgrounds'));
  migrateAssetFiles(path.join(sourceAssetsDir, 'slides'), path.join(targetAssetsDir, 'slides'));
}

// GET /api/projects — list all projects
router.get('/projects', (req, res) => {
  try {
    const projects = listProjectNames()
      .map(projectName => {
        const projectDir = getProjectDir(projectName);
        const hasScriptFile = fs.existsSync(path.join(projectDir, '02_script.json'));
        const hasMetaFile = fs.existsSync(path.join(projectDir, 'project.meta.json'));
        if (!hasScriptFile && !hasMetaFile) {
          return null;
        }

        let script = null;
        let meta = null;

        try {
          script = readProjectScript(projectName);
          meta = readProjectMeta(projectName, script);
        } catch (e) {
          meta = null;
        }

        return {
          name: projectName,
          has_script: !!script,
          language: script?.language || null,
          total_duration: script?.total_duration_seconds || null,
          parts_count: script?.parts?.length || 0,
          source_mode: meta?.source_mode || 'classic',
          status: meta?.status || (script ? 'ready' : 'draft'),
          created_at: meta?.created_at || null,
          updated_at: meta?.updated_at || null
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aUpdated = a.updated_at || '';
        const bUpdated = b.updated_at || '';
        return bUpdated.localeCompare(aUpdated) || b.name.localeCompare(a.name);
      });

    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects — create a new draft project for the in-studio builder
router.post('/projects', (req, res) => {
  try {
    const displayName = req.body?.display_name || req.body?.name || req.body?.title;
    const language = req.body?.language || 'ru';
    const sourceMode = req.body?.source_mode || 'studio';
    const initialScript = req.body?.initial_script || null;

    const { projectName, script, meta } = createProjectDraft({
      displayName,
      language,
      sourceMode,
      initialScript
    });

    res.status(201).json({
      success: true,
      name: projectName,
      script,
      meta
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/project/:name — project data (script.json)
router.get('/project/:name', (req, res) => {
  try {
    const projectName = assertSafeProjectName(req.params.name);
    const projectDir = getProjectDir(projectName);
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const script = readProjectScript(projectName);
    if (!script) {
      return res.status(404).json({ error: 'Script not found for this project' });
    }

    const responseScript = attachAssetMetadata(projectName, script);
    responseScript.meta = readProjectMeta(projectName, script);

    res.json(responseScript);
  } catch (err) {
    const statusCode = err.message === 'Invalid project name' ? 400 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

// PUT /api/project/:name/script — save the canonical project script in draft form
router.put('/project/:name/script', (req, res) => {
  try {
    const projectName = assertSafeProjectName(req.params.name);
    const scriptInput = req.body?.script && typeof req.body.script === 'object'
      ? req.body.script
      : req.body;
    const savedScript = writeProjectScript(projectName, scriptInput);
    const meta = touchProjectMeta(projectName, {
      status: req.body?.status || 'draft',
      source_mode: req.body?.source_mode || readProjectMeta(projectName, savedScript).source_mode
    }, savedScript);

    res.json({
      success: true,
      script: savedScript,
      meta
    });
  } catch (err) {
    const statusCode = isBadRequestProjectError(err.message) ? 400 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

// GET /api/project/:name/preferences — studio UI preferences stored outside script schema
router.get('/project/:name/preferences', (req, res) => {
  try {
    const projectName = assertSafeProjectName(req.params.name);
    const projectDir = getProjectDir(projectName);
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ preferences: readProjectPreferences(projectName) });
  } catch (err) {
    const statusCode = err.message === 'Invalid project name' ? 400 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

// PUT /api/project/:name/preferences — persist per-project studio UI preferences
router.put('/project/:name/preferences', (req, res) => {
  try {
    const projectName = assertSafeProjectName(req.params.name);
    const projectDir = getProjectDir(projectName);
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const preferencesInput = req.body?.preferences && typeof req.body.preferences === 'object'
      ? req.body.preferences
      : req.body;

    res.json({
      success: true,
      preferences: writeProjectPreferences(projectName, preferencesInput)
    });
  } catch (err) {
    const statusCode = err.message === 'Invalid project name' ? 400 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

// POST /api/project/:name/validate — run the existing validator on the canonical script
router.post('/project/:name/validate', (req, res) => {
  try {
    const projectName = assertSafeProjectName(req.params.name);
    const script = readProjectScript(projectName);
    if (!script) {
      return res.status(404).json({ error: 'Script not found for this project' });
    }

    let pythonBin;
    try {
      pythonBin = getPythonCommand();
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }

    execFile(pythonBin, [getValidateScriptPath(), path.join(getProjectsDir(), projectName, '02_script.json')], {
      timeout: 30000,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      }
    }, (error, stdout, stderr) => {
      const output = `${stdout || ''}${stderr || ''}`.trim();

      if (error && typeof error.code !== 'number') {
        return res.status(500).json({ error: output || error.message });
      }

      if (error && error.code === 2) {
        return res.status(500).json({ error: output || 'Validator runtime error' });
      }

      const meta = touchProjectMeta(projectName, {
        status: error ? 'draft' : 'ready'
      }, script);

      res.json({
        valid: !error,
        output,
        meta
      });
    });
  } catch (err) {
    const statusCode = err.message === 'Invalid project name' ? 400 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

// GET /api/project/:name/output — список файлов в output/ (видео, обложка, caption и т.д.)
router.get('/project/:name/output', (req, res) => {
  try {
    const projectName = assertSafeProjectName(req.params.name);
    const outputDir = path.join(getProjectDir(projectName), 'output');
    if (!fs.existsSync(outputDir)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(outputDir, { withFileTypes: true })
      .filter(d => d.isFile())
      .map(d => {
        const full = path.join(outputDir, d.name);
        let size = 0;
        let mtime = null;
        try {
          const st = fs.statSync(full);
          size = st.size;
          mtime = st.mtime.toISOString();
        } catch (_) {}
        const ext = path.extname(d.name).toLowerCase();
        let kind = 'other';
        if (['.mp4', '.webm', '.mov'].includes(ext)) kind = 'video';
        else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) kind = 'image';
        else if (['.txt', '.md', '.srt', '.ass'].includes(ext)) kind = 'text';
        else if (['.json'].includes(ext)) kind = 'json';
        return { name: d.name, size, mtime, kind, ext };
      })
      .sort((a, b) => (b.mtime || '').localeCompare(a.mtime || ''));

    res.json({ files, path: outputDir });
  } catch (err) {
    const status = err.message === 'Invalid project name' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/project/:name/output/:file — отдать файл из output/ (видео, картинка, текст)
router.get('/project/:name/output/:file', (req, res) => {
  try {
    const projectName = assertSafeProjectName(req.params.name);
    const fileName = String(req.params.file);
    // Защита от path traversal
    if (/[\\/]|\.\./.test(fileName)) {
      return res.status(400).json({ error: 'Invalid file name' });
    }
    const filePath = path.join(getProjectDir(projectName), 'output', fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.set('Cache-Control', 'no-store, must-revalidate');
    res.sendFile(path.resolve(filePath));
  } catch (err) {
    const status = err.message === 'Invalid project name' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/project/:name/reveal-output — открыть папку output/ в Проводнике
router.post('/project/:name/reveal-output', (req, res) => {
  try {
    const projectName = assertSafeProjectName(req.params.name);
    const outputDir = path.join(getProjectDir(projectName), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    // Открываем папку в системном файловом менеджере
    const opener = process.platform === 'win32' ? 'explorer'
                 : process.platform === 'darwin' ? 'open'
                 : 'xdg-open';
    execFile(opener, [outputDir], () => { /* ignore spawn result — это «запустили и забыли» */ });
    res.json({ success: true, path: outputDir });
  } catch (err) {
    const status = err.message === 'Invalid project name' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// DELETE /api/project/:name — удаление проекта целиком (со всеми assets и output)
router.delete('/project/:name', (req, res) => {
  try {
    const projectName = assertSafeProjectName(req.params.name);
    const projectDir = getProjectDir(projectName);
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    // Защита: проверяем что путь действительно внутри projects/ и не наружу.
    const projectsDir = path.resolve(getProjectsDir());
    const resolved = path.resolve(projectDir);
    if (!resolved.startsWith(projectsDir + path.sep) || resolved === projectsDir) {
      return res.status(400).json({ error: 'Некорректный путь проекта' });
    }

    fs.rmSync(projectDir, { recursive: true, force: true });
    res.json({ success: true, deleted: projectName });
  } catch (err) {
    const statusCode = err.message === 'Invalid project name' ? 400 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

module.exports = router;
