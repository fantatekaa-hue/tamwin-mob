const { app, BrowserWindow, protocol } = require('electron');
const fs = require('fs');
const path = require('path');

// Register custom privileged scheme BEFORE app is ready so IndexedDB, Fetch, and absolute paths work identically to HTTPS
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const DIST_DIR = path.resolve(__dirname, '..', 'dist');

function createMainWindow() {
  const iconPath = path.join(DIST_DIR, 'pwa-512x512.png');
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    title: 'مساعد استعاضة التموين — أحمد حسب الله',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    backgroundColor: '#F4F7FB',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL('app://tamween/index.html');
}

app.setAppUserModelId('com.ahmedhasaballah.tamween');

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const reqUrl = new URL(request.url);
    let relPath = decodeURIComponent(reqUrl.pathname || '/');
    if (relPath === '/' || relPath === '') {
      relPath = '/index.html';
    }

    const safeRel = relPath.replace(/^\/+/, '');
    let targetPath = path.resolve(DIST_DIR, safeRel);

    // Prevent path traversal outside dist/
    if (!targetPath.startsWith(DIST_DIR)) {
      targetPath = path.join(DIST_DIR, 'index.html');
    }

    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(targetPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = fs.readFileSync(targetPath);

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
      },
    });
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
