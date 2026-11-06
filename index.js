// index.js
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./storage');

// Same name, and the same save folder, whether you run `npm start` or the installed app
app.setName('Corner Note');

let win = null;
let store = null;

// Only one Corner Note at a time, so two windows can't overwrite each other's saves
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 300,
    height: 300,
    alwaysOnTop: true,
    resizable: true,
    frame: true,
    skipTaskbar: false, // show in dock/taskbar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);

  // Right-click menu: the usual editing actions plus earlier versions of the note
  win.webContents.on('context-menu', () => {
    const versions = store.versions();
    const fmt = (d) => d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    Menu.buildFromTemplate([
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Restore an earlier version',
        enabled: versions.length > 0,
        submenu: versions.map((v) => ({
          label: `${fmt(v.time)}  ·  ${v.preview || '(blank)'}${v.length > 40 ? '…' : ''}`,
          click: () => {
            const text = store.restore(v.id);
            if (text != null) win.webContents.send('note:restored', text);
          }
        }))
      }
    ]).popup({ window: win });
  });

  // Optional: open DevTools for debugging
  // win.webContents.openDevTools();
}

// Notes from older versions of the app were saved next to the app itself. Bring them over once.
function migrateOldNote() {
  if (store.load()) return;
  const old = path.join(__dirname, 'note.txt');
  try {
    const text = fs.readFileSync(old, 'utf-8');
    if (text) store.save(text);
  } catch (e) {}
}

app.whenReady().then(() => {
  store = createStore(app.getPath('userData'));
  migrateOldNote();

  ipcMain.handle('note:load', () => store.load());
  ipcMain.on('note:save', (e, text) => { try { store.save(text); } catch (err) { console.error('Save failed:', err); } });
  // Used when the window closes: waits until the note is on disk
  ipcMain.on('note:save-now', (e, text) => {
    try { store.save(text); e.returnValue = true; } catch (err) { console.error('Save failed:', err); e.returnValue = false; }
  });

  createWindow();

  app.setLoginItemSettings({
    openAtLogin: true
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && store) createWindow();
});
