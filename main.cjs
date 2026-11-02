const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const extractZip = require('extract-zip');

const RELEASE_OWNER = 'salmanmfa2';
const RELEASE_REPOSITORY = 'PBNCLeaner-desktop-releases';
const RELEASE_API = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPOSITORY}`;
const MAX_RUNTIME_DOWNLOAD_SIZE = 750 * 1024 * 1024;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  let backendProcess;
  let mainWindow;
  let setupWindow;
  let shuttingDown = false;
  let startupOutput = '';
  let startupTimer;
  let readyToShow = false;
  let updaterConfigured = false;

  function writeLog(message) {
    const line = `${new Date().toISOString()} ${message}\n`;
    console.info(line.trim());
    if (app.isReady()) {
      fs.appendFile(path.join(app.getPath('userData'), 'desktop-app.log'), line).catch((error) => {
        console.error(`Could not write desktop log: ${error.message}`);
      });
    }
  }

  function getBackendExecutable() {
    if (app.isPackaged) {
      return path.join(
        app.getPath('userData'),
        'python-runtime',
        app.getVersion(),
        'PBNCleaner.exe'
      );
    }

    return path.join(
      __dirname,
      '..',
      '..',
      'release',
      'desktop-build',
      'PBNCleaner',
      'PBNCleaner.exe'
    );
  }

  function updateSetupStatus(message, percent) {
    if (!setupWindow || setupWindow.isDestroyed()) {
      return;
    }
    const messageJson = JSON.stringify(message);
    const progress = Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : null;
    setupWindow.webContents.executeJavaScript(
      `document.getElementById('status').textContent = ${messageJson};` +
      `document.getElementById('progress').style.width = ${JSON.stringify(`${progress ?? 0}%`)};` +
      `document.getElementById('progress').hidden = ${progress === null};`
    ).catch((error) => writeLog(`Could not update setup progress: ${error.message}`));
  }

  function createSetupWindow() {
    setupWindow = new BrowserWindow({
      width: 460,
      height: 220,
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      title: 'PBN Cleaner Setup',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;padding:32px;background:#0f172a;color:#f1f5f9;font:14px Segoe UI,Arial,sans-serif}
      h1{margin:0 0 12px;font-size:19px}p{color:#cbd5e1;line-height:1.55}
      .track{height:8px;margin-top:24px;border-radius:8px;background:#334155;overflow:hidden}
      #progress{height:100%;width:0;background:#0ea5e9;transition:width .2s}
    </style></head><body><h1>Preparing PBN Cleaner</h1>
      <p id="status">Checking the installed Python runtime…</p>
      <div class="track"><div id="progress" hidden></div></div></body></html>`;
    setupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return setupWindow;
  }

  async function fetchReleaseByTag(version) {
    const response = await fetch(`${RELEASE_API}/releases/tags/v${version}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'PBN-Cleaner-Desktop',
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? `Release v${version} is not published in the desktop releases repository yet.`
          : `GitHub release lookup failed (${response.status}).`
      );
    }
    const release = await response.json();
    if (release.tag_name !== `v${version}` || release.draft) {
      throw new Error(`The published runtime for version ${version} is not available.`);
    }
    return release;
  }

  function getReleaseAsset(release, name) {
    const asset = release.assets.find((item) => item.name === name);
    if (!asset || !asset.browser_download_url) {
      throw new Error(`Release ${release.tag_name} is missing required asset ${name}.`);
    }
    const assetUrl = new URL(asset.browser_download_url);
    if (assetUrl.protocol !== 'https:' || assetUrl.hostname !== 'github.com') {
      throw new Error(`Release asset ${name} has an unexpected download URL.`);
    }
    return asset;
  }

  async function getExpectedSha256(release, asset) {
    const checksumAsset = getReleaseAsset(
      release,
      `${asset.name}.sha256`
    );
    const response = await fetch(checksumAsset.browser_download_url, {
      headers: { 'User-Agent': 'PBN-Cleaner-Desktop' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Could not download the checksum for ${asset.name}.`);
    }
    const checksumText = (await response.text()).trim();
    const match = checksumText.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match || match[2].trim() !== asset.name) {
      throw new Error(`The checksum file for ${asset.name} is malformed.`);
    }
    return match[1].toLowerCase();
  }

  async function downloadAsset(asset, destination, onProgress) {
    if (asset.size > MAX_RUNTIME_DOWNLOAD_SIZE) {
      throw new Error(`The runtime bundle exceeds the ${MAX_RUNTIME_DOWNLOAD_SIZE / 1024 / 1024} MB safety limit.`);
    }
    const response = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': 'PBN-Cleaner-Desktop' },
      signal: AbortSignal.timeout(30 * 60_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Could not download ${asset.name} (${response.status}).`);
    }

    const totalBytes = Number(response.headers.get('content-length')) || asset.size;
    let receivedBytes = 0;
    const progressStream = new (require('node:stream').Transform)({
      transform(chunk, encoding, callback) {
        receivedBytes += chunk.length;
        if (totalBytes > 0) {
          onProgress(Math.round((receivedBytes / totalBytes) * 100));
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(response.body),
        progressStream,
        createWriteStream(destination, { flags: 'wx' })
      );
    } catch (error) {
      await fs.rm(destination, { force: true }).catch(() => {});
      throw error;
    }
  }

  async function calculateSha256(filePath) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  }

  function isRuntimeInstalled(executable) {
    return fs.access(executable).then(() => true, () => false);
  }

  async function ensureBackendRuntime() {
    const version = app.getVersion();
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
      throw new Error(`The desktop app has an invalid version number: ${version}.`);
    }
    const executable = getBackendExecutable();
    const runtimeDirectory = path.dirname(executable);
    const runtimeMarker = path.join(runtimeDirectory, '.runtime.sha256');
    const runtimeIsInstalled = await isRuntimeInstalled(executable);
    const runtimeHasIntegrityMarker = await isRuntimeInstalled(runtimeMarker);
    if (runtimeIsInstalled && runtimeHasIntegrityMarker) {
      return executable;
    }

    const progressWindow = createSetupWindow();
    await new Promise((resolve) => progressWindow.once('ready-to-show', resolve));
    const confirmation = await dialog.showMessageBox(progressWindow, {
      type: 'info',
      title: runtimeIsInstalled ? 'Refresh desktop runtime' : 'First-time setup',
      message: runtimeIsInstalled
        ? 'Refresh the Python runtime used by PBN Cleaner?'
        : 'Download the Python runtime required by PBN Cleaner?',
      detail: 'The version-matched bundle contains the local service and its Python dependencies. It is downloaded from the public PBN Cleaner GitHub releases and verified with SHA-256. An internet connection is required.',
      buttons: [runtimeIsInstalled ? 'Refresh runtime' : 'Download required files', 'Exit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (confirmation.response !== 0) {
      progressWindow.close();
      throw new Error('First-time setup was cancelled. PBN Cleaner needs its Python runtime to start.');
    }

    const runtimeRoot = path.join(app.getPath('userData'), 'python-runtime');
    const finalDirectory = path.join(runtimeRoot, version);
    const temporaryDirectory = path.join(runtimeRoot, `.setup-${version}`);
    const assetName = `pbn-cleaner-backend-${version}-win-x64.zip`;
    const archivePath = path.join(temporaryDirectory, assetName);
    const extractionDirectory = path.join(temporaryDirectory, 'extracted');

    try {
      updateSetupStatus('Finding the matching versioned runtime…');
      const release = await fetchReleaseByTag(version);
      const runtimeAsset = getReleaseAsset(release, assetName);
      const expectedHash = await getExpectedSha256(release, runtimeAsset);

      await fs.mkdir(runtimeRoot, { recursive: true });
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
      await fs.mkdir(extractionDirectory, { recursive: true });
      updateSetupStatus('Downloading Python runtime and dependencies…', 0);
      await downloadAsset(runtimeAsset, archivePath, (percent) => {
        updateSetupStatus('Downloading Python runtime and dependencies…', percent);
      });

      updateSetupStatus('Verifying the downloaded runtime…');
      const actualHash = await calculateSha256(archivePath);
      if (actualHash !== expectedHash) {
        throw new Error('The downloaded Python runtime failed its SHA-256 integrity check.');
      }

      updateSetupStatus('Installing the verified runtime…');
      await extractZip(archivePath, { dir: extractionDirectory });
      const extractedExecutable = path.join(extractionDirectory, 'PBNCleaner.exe');
      if (!(await isRuntimeInstalled(extractedExecutable))) {
        throw new Error('The runtime bundle is invalid: PBNCleaner.exe was not found.');
      }
      await fs.writeFile(
        path.join(extractionDirectory, '.runtime.sha256'),
        `${expectedHash}\n`,
        'utf8'
      );

      await fs.rm(finalDirectory, { recursive: true, force: true });
      await fs.rename(extractionDirectory, finalDirectory);
      updateSetupStatus('Setup complete. Starting PBN Cleaner…');
      return executable;
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
      if (setupWindow && !setupWindow.isDestroyed()) {
        setupWindow.close();
      }
      setupWindow = null;
    }
  }

  function configureAutoUpdater() {
    if (!app.isPackaged || updaterConfigured) {
      return;
    }
    updaterConfigured = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = {
      info: (message) => writeLog(`Updater: ${message}`),
      warn: (message) => writeLog(`Updater warning: ${message}`),
      error: (message) => writeLog(`Updater error: ${message}`),
    };
    autoUpdater.on('update-available', (info) => {
      writeLog(`Update ${info.version} is available; downloading automatically.`);
    });
    autoUpdater.on('update-not-available', (info) => {
      writeLog(`No update available; installed version is ${info.version}.`);
    });
    autoUpdater.on('download-progress', (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(progress.percent / 100);
      }
    });
    autoUpdater.on('update-downloaded', async (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(-1);
      }
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'PBN Cleaner update ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'Install the update and restart PBN Cleaner now?',
        buttons: ['Install and restart', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
    autoUpdater.on('error', (error) => {
      writeLog(`Update check/download failed: ${error.message}`);
    });
    autoUpdater.checkForUpdates().catch((error) => {
      writeLog(`Could not check for updates: ${error.message}`);
    });
  }

  function showStartupError(message) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    clearTimeout(startupTimer);
    dialog.showErrorBox('PBN Cleaner could not start', message);
    app.quit();
  }

  function createWindow(url) {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 960,
      minHeight: 640,
      show: false,
      autoHideMenuBar: true,
      title: 'PBN Cleaner',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      mainWindow.focus();
      configureAutoUpdater();
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
      app.quit();
    });
    mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
      if (!targetUrl.startsWith(url)) {
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
    mainWindow.loadURL(url).catch((error) => {
      showStartupError(`The desktop window could not load the local app: ${error.message}`);
    });
  }

  async function startBackend() {
    const executable = app.isPackaged
      ? await ensureBackendRuntime()
      : getBackendExecutable();
    if (!(await isRuntimeInstalled(executable))) {
      throw new Error(`The local service executable was not found at ${executable}.`);
    }

    backendProcess = spawn(executable, [], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PBN_DESKTOP_MODE: '1',
      },
    });

    backendProcess.stdout.setEncoding('utf8');
    backendProcess.stdout.on('data', (chunk) => {
      startupOutput += chunk;
      const readyLine = startupOutput.match(/PBN_READY_URL=(http:\/\/127\.0\.0\.1:\d+\/)/);
      if (readyLine && !readyToShow) {
        readyToShow = true;
        clearTimeout(startupTimer);
        createWindow(readyLine[1]);
      }
    });

    backendProcess.stderr.setEncoding('utf8');
    backendProcess.stderr.on('data', (chunk) => {
      startupOutput += chunk;
    });

    backendProcess.on('error', (error) => {
      showStartupError(`The local service could not be launched.\n\n${error.message}`);
    });

    backendProcess.on('exit', (code) => {
      if (!shuttingDown) {
        showStartupError(
          `The local service stopped unexpectedly (exit code ${code}).\n\n${startupOutput.slice(-3000)}`
        );
      }
    });

    startupTimer = setTimeout(() => {
      showStartupError(
        `The local service did not become ready in time.\n\n${startupOutput.slice(-3000)}`
      );
    }, 30000);
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.on('before-quit', () => {
    shuttingDown = true;
    clearTimeout(startupTimer);
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill();
    }
  });

  app.whenReady().then(() => {
    startBackend().catch((error) => {
      showStartupError(error.message);
    });
  });
}
