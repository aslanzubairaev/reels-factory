const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getAppRoot } = require('./lib/runtime-paths');

function createApp({ enableTestRoutes = false } = {}) {
  const app = express();

  // CORS ограничен локальным сервером — Studio работает только на 127.0.0.1/localhost.
  // Никаких кросс-доменных запросов быть не должно: Electron-окно, браузер на том же хосте.
  const PORT = process.env.PORT || 3000;
  const allowedOrigins = new Set([
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    'file://', // Electron detached terminal-window.html
  ]);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / server-to-server
      if (allowedOrigins.has(origin) || origin.startsWith('file://')) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'), false);
    }
  }));

  // Безопасность: стандартные защитные заголовки + CSP.
  // 'unsafe-inline' для CSS оставляем — в studio/public/index.html есть inline-стили xterm.
  // JS выполняется только из /js/* и /vendor/xterm/* — скрипты с других доменов запрещены.
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'"
      ].join('; ')
    );
    next();
  });

  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500mb' }));

  // Static files — studio frontend.
  // Disable HTTP caching so JS/CSS updates are picked up immediately on reload.
  app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.set('Cache-Control', 'no-store, must-revalidate')
  }));

  // xterm.js — раздаём из node_modules под /vendor/xterm для встроенного терминала.
  app.use('/vendor/xterm', express.static(path.join(__dirname, '..', 'node_modules', '@xterm')));

  app.use('/api', require('./routes/project'));
  app.use('/api', require('./routes/assets'));
  app.use('/api', require('./routes/generate'));
  app.use('/api', require('./routes/record'));
  app.use('/api', require('./routes/convert'));
  app.use('/api', require('./routes/slide'));
  app.use('/api', require('./routes/upload'));

  if (enableTestRoutes) {
    app.get('/__test__/error', () => {
      throw new Error('Intentional test error');
    });
  }

  app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
      return;
    }

    res.status(200).send('<h1>Reels Factory Studio</h1><p>Frontend not yet created.</p>');
  });

  app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ error: err.message });
  });

  app.locals.appRoot = getAppRoot();
  return app;
}

module.exports = { createApp };
