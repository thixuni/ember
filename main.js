const {app, BrowserWindow, Menu, Tray, shell, dialog, ipcMain, screen, nativeTheme, Notification} = require('electron');
const path = require('path');
const fs = require('fs');
const KEY = 'ember-v1';
const KEY_OLD = 'everyday-orbit-v1';    // what the planner was saved under before the rename

let win = null;              // the planner
let timerWin = null;
let timerDrag = null;         // where the timer window was when a drag began         // the floating timer
let updater = null;          // lazily required; absent in dev
let updateCheckIsManual = false;
let lastTimerState = {state: 'idle'};
let tray = null;             // lives by the clock so the app can outlive its window
let quitting = false;        // true only once the user has actually asked to quit

/* ---------------------------------------------------------------- settings
 * The renderer keeps its own copy of the vault path for display, but the main
 * process needs it before any window exists, so it lives here too.
 */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings(){
  try{ return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {}; }catch(e){ return {}; }
}
function writeSettings(patch){
  const s = Object.assign(readSettings(), patch);
  try{ fs.mkdirSync(app.getPath('userData'), {recursive: true}); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2), 'utf8'); }catch(e){}
  return s;
}

function iconPath(){
  return path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

/* ------------------------------------------------------------- main window */

function createWindow(){
  win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 940, minHeight: 600,
    title: 'Ember',
    /* Only to avoid a white flash before the app paints; the app itself
       decides the theme. Follows the system, which is the usual case. */
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1B1B1D' : '#F5F5F6',
    icon: iconPath(),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, spellcheck: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('page-title-updated', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({url}) => {
    if(/^https?:/i.test(url)) shell.openExternal(url);
    return {action: 'deny'};
  });
  /* Closing the window puts the planner away rather than quitting it: a timer
     you started should not disappear because you tidied the window off screen.
     Quit properly from the tray or the File menu. */
  win.on('close', e => {
    if(quitting) return;
    e.preventDefault();
    win.hide();
  });
  win.on('closed', () => { win = null; });
  win.webContents.on('did-finish-load', () => startWatching(readSettings().vault));
}

/* Bring the planner back, wherever it was left. */
function showPlanner(){
  if(!win || win.isDestroyed()){ createWindow(); return; }
  if(win.isMinimized()) win.restore();
  if(!win.isVisible()) win.show();
  win.focus();
}

/* ------------------------------------------------------------------- tray */
/* The app outlives its window so a timer can keep running while the planner
   is out of the way. The tray icon is the only way back, and the only way to
   quit for real. */
function buildTray(){
  if(tray) return tray;
  try{ tray = new Tray(iconPath()); }catch(e){ tray = null; return null; }
  tray.setToolTip("Ember");
  const refresh = () => {
    const live = lastTimerState && lastTimerState.state !== "idle";
    tray.setContextMenu(Menu.buildFromTemplate([
      {label: "Open Ember", click: showPlanner},
      {label: live ? "Show the timer" : "Show the timer (nothing running)",
       enabled: !!live, click: () => { const w = createTimerWindow(); if(!w.isDestroyed() && !w.isVisible()) w.showInactive(); }},
      {type: "separator"},
      {label: "Quit", click: () => { quitting = true; app.quit(); }}
    ]));
  };
  refresh();
  tray.on("click", showPlanner);
  tray.refresh = refresh;
  return tray;
}

/* --------------------------------------------------------- floating timer */

function createTimerWindow(){
  if(timerWin && !timerWin.isDestroyed()) return timerWin;
  const saved = readSettings().timerPos;
  const area = screen.getPrimaryDisplay().workArea;
  timerWin = new BrowserWindow({
    /* A capsule of two lines at most, with room round it for its shadow. */
    width: 320, height: 76,
    x: saved ? saved.x : area.x + area.width - 336,
    y: saved ? saved.y : area.y + area.height - 96,
    frame: false, transparent: true, resizable: false, movable: true,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false,
    icon: iconPath(),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  /* Sit above full-screen apps too, which is the point of a focus timer. */
  timerWin.setAlwaysOnTop(true, 'screen-saver');
  timerWin.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
  timerWin.loadFile(path.join(__dirname, 'src', 'timer.html'));
  timerWin.once('ready-to-show', () => {
    timerWin.showInactive();                       // never steal focus
    timerWin.webContents.send('timer:cmd', lastTimerState);
  });
  const remember = () => {
    if(!timerWin || timerWin.isDestroyed()) return;
    const b = timerWin.getBounds();
    writeSettings({timerPos: {x: b.x, y: b.y}});
  };
  timerWin.on('moved', remember);
  timerWin.on('closed', () => { timerWin = null; });
  return timerWin;
}
function closeTimerWindow(){
  if(timerWin && !timerWin.isDestroyed()) timerWin.destroy();
  timerWin = null;
}

ipcMain.on('timer:state', (e, payload) => {
  /* Two directions share this channel: a command carries `cmd`, state does not. */
  if(payload && payload.cmd){
    /* The capsule is moved by hand, not by a system drag region, which would
       swallow the hover that shows its controls. */
    if(/^drag/.test(payload.cmd)){
      if(!timerWin || timerWin.isDestroyed()) return;
      if(payload.cmd === 'drag-start') timerDrag = timerWin.getPosition();
      else if(payload.cmd === 'drag' && timerDrag)
        timerWin.setPosition(Math.round(timerDrag[0] + (payload.dx || 0)), Math.round(timerDrag[1] + (payload.dy || 0)));
      else if(payload.cmd === 'drag-end'){ timerDrag = null; const b = timerWin.getBounds(); writeSettings({timerPos: {x: b.x, y: b.y}}); }
      return;
    }
    if(payload.cmd === 'hide'){ closeTimerWindow(); return; }
    if(payload.cmd === 'open'){ showPlanner(); }
    if(win && !win.isDestroyed()) win.webContents.send('timer:cmd', payload);
    return;
  }
  lastTimerState = payload || {state: 'idle'};
  if(tray && tray.refresh) tray.refresh();
  if(timerWin && !timerWin.isDestroyed()) timerWin.webContents.send('timer:cmd', lastTimerState);
  /* A timer that stops closes the window with it. */
  if(lastTimerState.state === 'idle') closeTimerWindow();
});
ipcMain.on('timer:pop', () => {
  const w = createTimerWindow();
  if(w.isDestroyed()) return;
  if(!w.isVisible()) w.showInactive();
  w.webContents.send('timer:cmd', lastTimerState);
});

/* --------------------------------------------------------------- backups */

ipcMain.handle('backup:dir', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Where should backups go?',
    properties: ['openDirectory', 'createDirectory']
  });
  return (r.canceled || !r.filePaths[0]) ? "" : r.filePaths[0];
});
/* Fire and forget: a backup that fails must never interrupt the planner. */
/* Answers whether the file was written. It used to swallow every error and
   tell the page nothing, so "Backed up" was said whether or not anything
   reached the disk -- a folder that had been moved, renamed or was on a
   drive that was not plugged in failed in silence. */
ipcMain.handle('backup:write', (e, job) => {
  if(!job || !job.dir || !job.name) return {ok: false, error: 'No folder chosen'};
  const file = path.join(job.dir, job.name);
  try{
    fs.mkdirSync(job.dir, {recursive: true});
    fs.writeFileSync(file, String(job.text || ''), 'utf8');
    return {ok: true, path: file};
  }catch(err){
    return {ok: false, error: (err && err.message) || 'The folder could not be written to'};
  }
});

/* ------------------------------------------------------------ vault sync */

const VAULT_DIR = 'Ember';
const VAULT_DIR_OLD = 'Everyday Orbit';   // the folder documents were in before the rename
let watcher = null;
let watchedDir = '';
const justWritten = new Map();          // file -> ms, so our own writes do not echo back
let debounce = null;

function vaultDir(vault){
  if(!vault) return '';
  const dir = path.join(vault, VAULT_DIR), old = path.join(vault, VAULT_DIR_OLD);
  /* Documents written before the rename are moved once, so Obsidian keeps
     them in one folder rather than two. */
  try{ if(!fs.existsSync(dir) && fs.existsSync(old)) fs.renameSync(old, dir); }catch(err){}
  return dir;
}

function startWatching(vault){
  stopWatching();
  const dir = vaultDir(vault);
  if(!dir) return;
  try{ fs.mkdirSync(dir, {recursive: true}); }catch(e){ return; }
  watchedDir = dir;
  try{
    watcher = fs.watch(dir, {persistent: false}, (evt, file) => {
      if(!file || !/\.md$/i.test(file)) return;
      const at = justWritten.get(file);
      if(at && Date.now() - at < 2000) return;      // this was us
      clearTimeout(debounce);
      debounce = setTimeout(() => readBack(file), 250);
    });
  }catch(e){ watcher = null; }
}
function stopWatching(){
  if(watcher){ try{ watcher.close(); }catch(e){} }
  watcher = null; watchedDir = '';
}
/* A document edited in Obsidian comes back in through here. */
function readBack(file){
  if(!watchedDir || !win || win.isDestroyed()) return;
  const full = path.join(watchedDir, file);
  let text = null;
  try{ text = fs.readFileSync(full, 'utf8'); }catch(e){ return; }   // deleted, or mid-write
  const id = (text.match(/^orbit-id:\s*(\S+)\s*$/m) || [])[1];
  if(!id) return;                                   // not one of ours
  const title = (text.match(/^title:\s*(.*)$/m) || [])[1];
  let clean = title || '';
  try{ if(/^".*"$/.test(clean)) clean = JSON.parse(clean); }catch(e){}
  win.webContents.send('vault:changed', {
    id: id, file: file, title: clean,
    md: text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/^\r?\n/, '')
  });
}

ipcMain.handle('vault:choose', async () => {
  if(!win) return null;
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose your Obsidian vault',
    message: 'Documents are written into an “Ember” folder inside it.',
    properties: ['openDirectory', 'createDirectory']
  });
  if(res.canceled || !res.filePaths[0]) return null;
  const vault = res.filePaths[0];
  writeSettings({vault: vault});
  startWatching(vault);
  return vault;
});
ipcMain.handle('vault:forget', () => { writeSettings({vault: ''}); stopWatching(); return true; });
ipcMain.on('vault:use', (e, p) => { if(p){ writeSettings({vault: p}); startWatching(p); } });
ipcMain.on('vault:open', () => {
  const dir = vaultDir(readSettings().vault);
  if(dir){ try{ fs.mkdirSync(dir, {recursive: true}); }catch(e){} shell.openPath(dir); }
});

ipcMain.on('doc:write', (e, doc) => {
  const dir = vaultDir(readSettings().vault);
  if(!dir || !doc || !doc.file) return;
  try{
    fs.mkdirSync(dir, {recursive: true});
    justWritten.set(doc.file, Date.now());
    fs.writeFileSync(path.join(dir, doc.file), doc.body, 'utf8');
  }catch(err){}
});
ipcMain.on('doc:delete', (e, doc) => {
  const dir = vaultDir(readSettings().vault);
  if(!dir || !doc || !doc.file) return;
  try{
    justWritten.set(doc.file, Date.now());
    fs.unlinkSync(path.join(dir, doc.file));
  }catch(err){}
});

/* --------------------------------------------------------- google calendar
 * Sign-in and tokens live in gcal.js and never cross into the page; the page
 * gets connect, disconnect, status, and a request call that only reaches the
 * Calendar API.
 */
/* The app's own Google client. It is not in the repository: the release
   workflow writes google-client.json from the repository's secrets, and a
   developer can drop the file Google Cloud offers for download next to
   main.js, or set the two environment variables. Google treats a desktop
   client's secret as not really secret, but it still has no business in a
   public repo. */
function googleClient(){
  try{
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'google-client.json'), 'utf8'));
    const c = j.installed || j;
    if(c.client_id || c.clientId) return {clientId: c.client_id || c.clientId, clientSecret: c.client_secret || c.clientSecret || ''};
  }catch(e){}
  return {clientId: process.env.ORBIT_GOOGLE_CLIENT_ID || '', clientSecret: process.env.ORBIT_GOOGLE_CLIENT_SECRET || ''};
}
const gcal = require('./gcal')(readSettings, writeSettings, {builtIn: googleClient()});
ipcMain.handle('gcal:connect', (e, input) => gcal.connect(input));
ipcMain.handle('gcal:cancel', () => gcal.cancel());
ipcMain.handle('gcal:disconnect', () => gcal.disconnect());
ipcMain.handle('gcal:status', () => gcal.status());
ipcMain.handle('gcal:request', (e, req) => gcal.request(req));

/* -------------------------------------------------------------- reminders
 * The planner works out what to remind and when, and hands the whole list
 * over each time it changes; this side only keeps the timers and shows the
 * notifications. Timers here are not throttled the way a hidden window's
 * are, and they keep running with the window closed, which is the point.
 */
const remindTimers = new Map();
const remindFired = new Set();      // this session; a new list cannot re-send one
const remindShown = new Set();      // held so a click handler is not collected
function showReminder(r){
  if(!Notification.isSupported()) return;
  const n = new Notification({title: r.title, body: r.body || '', icon: iconPath()});
  remindShown.add(n);
  const drop = () => remindShown.delete(n);
  n.on('click', () => {
    showPlanner();
    const send = () => { if(win && !win.isDestroyed()) win.webContents.send('remind:open', r.open || null); };
    if(win && win.webContents.isLoading()) win.webContents.once('did-finish-load', send); else send();
    drop();
  });
  n.on('close', drop);
  n.show();
}
ipcMain.on('remind:schedule', (e, list) => {
  for(const t of remindTimers.values()) clearTimeout(t);
  remindTimers.clear();
  const now = Date.now();
  (Array.isArray(list) ? list : []).forEach(r => {
    if(!r || !r.id || remindFired.has(r.id)) return;
    const wait = Number(r.at) - now;
    /* A minute late is still worth sending; an hour late is not. */
    if(!(wait > -60000) || wait > 48 * 3600 * 1000) return;
    remindTimers.set(r.id, setTimeout(() => {
      remindTimers.delete(r.id);
      remindFired.add(r.id);
      showReminder(r);
    }, Math.max(0, wait)));
  });
});
ipcMain.on('remind:test', (e, r) => showReminder(Object.assign({title: 'Ember', body: ''}, r || {}, {open: null})));

/* ------------------------------------------------------------ attachments */

ipcMain.on('file:save', (e, req) => {
  e.returnValue = null;
  if(!req || !req.path) return;
  try{
    const dir = path.join(app.getPath('userData'), 'attachments', String(req.task || 'misc'));
    fs.mkdirSync(dir, {recursive: true});
    const dest = path.join(dir, Date.now() + '-' + path.basename(req.name || req.path));
    fs.copyFileSync(req.path, dest);
    e.returnValue = {path: dest};
  }catch(err){ e.returnValue = null; }
});
ipcMain.on('file:open', (e, p) => { if(p) shell.openPath(p); });

/* ------------------------------------------------------- backup / restore */

async function backup(){
  if(!win) return;
  let raw = null;
  try{
    raw = await win.webContents.executeJavaScript(
      'localStorage.getItem(' + JSON.stringify(KEY) + ') || localStorage.getItem(' + JSON.stringify(KEY_OLD) + ')');
  }catch(e){ raw = null; }
  if(!raw){
    dialog.showMessageBox(win, {type: 'info', message: 'Nothing to back up yet', detail: 'Add a task or two first.'});
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const res = await dialog.showSaveDialog(win, {
    title: 'Back up your planner',
    defaultPath: 'ember-' + stamp + '.json',
    filters: [{name: 'Planner backup', extensions: ['json']}]
  });
  if(res.canceled || !res.filePath) return;
  let data = null;
  try{ data = JSON.parse(raw); }catch(e){ data = null; }
  const payload = {app: 'ember', version: 1, exported: new Date().toISOString(), data: data};
  try{
    fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf8');
    dialog.showMessageBox(win, {type: 'info', message: 'Backup saved', detail: res.filePath});
  }catch(e){
    dialog.showErrorBox('Could not save the backup', String(e && e.message || e));
  }
}

async function restore(){
  if(!win) return;
  const res = await dialog.showOpenDialog(win, {
    title: 'Restore a backup',
    properties: ['openFile'],
    filters: [{name: 'Planner backup', extensions: ['json']}]
  });
  if(res.canceled || !res.filePaths || !res.filePaths[0]) return;
  let o = null;
  try{
    o = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
  }catch(e){
    dialog.showErrorBox('That file is not readable', 'It does not contain valid JSON.');
    return;
  }
  const d = (o && o.data) ? o.data : o;
  if(!d || !Array.isArray(d.tasks)){
    dialog.showErrorBox('That is not a planner backup', 'The file is missing the task list.');
    return;
  }
  const ans = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Cancel', 'Restore'], defaultId: 1, cancelId: 0,
    message: 'Replace everything in the planner?',
    detail: 'The file holds ' + d.tasks.length + ' tasks, ' + ((d.routines || []).length) +
            ' routines and ' + ((d.notes || []).length) + ' notes. What is in the planner now will be replaced.'
  });
  if(ans.response !== 1) return;
  try{
    await win.webContents.executeJavaScript(
      'localStorage.setItem(' + JSON.stringify(KEY) + ',' + JSON.stringify(JSON.stringify(d)) + ');true'
    );
    win.reload();
  }catch(e){
    dialog.showErrorBox('Could not restore', String(e && e.message || e));
  }
}

/* ------------------------------------------------------------------ updates
 * Installed copies check GitHub Releases on launch and then every six hours.
 * The portable .exe and a `npm start` dev run are not updatable, so the
 * updater is never loaded there.
 */

function updatesSupported(){
  return app.isPackaged && process.env.EVERYDAY_ORBIT_NO_UPDATE !== '1';
}

function initUpdater(){
  if(!updatesSupported()) return;
  try{
    updater = require('electron-updater').autoUpdater;
  }catch(e){
    updater = null;
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on('update-downloaded', info => {
    if(!win) return;
    dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: 'Ember ' + info.version + ' is ready',
      detail: 'Your planner data is not touched by an update. Restart to finish installing, or it will be applied next time you quit.'
    }).then(r => { if(r.response === 0) updater.quitAndInstall(); });
  });

  updater.on('update-not-available', () => {
    if(updateCheckIsManual && win){
      dialog.showMessageBox(win, {
        type: 'info',
        message: 'You are up to date',
        detail: 'Ember ' + app.getVersion() + ' is the latest version.'
      });
    }
    updateCheckIsManual = false;
  });

  updater.on('error', err => {
    if(updateCheckIsManual && win){
      dialog.showMessageBox(win, {
        type: 'warning',
        message: 'Could not check for updates',
        detail: String(err && err.message || err) + '\n\nYou can always download the latest version from the Ember releases page.'
      });
    }
    updateCheckIsManual = false;
  });

  setTimeout(check, 4000);
  setInterval(check, 6 * 60 * 60 * 1000);
}

function check(){
  if(!updater) return;
  updater.checkForUpdates().catch(() => {});
}

function checkManually(){
  if(!updatesSupported() || !updater){
    dialog.showMessageBox(win, {
      type: 'info',
      message: 'Updates are not available in this copy',
      detail: 'Automatic updates work in the installed version. This looks like a portable or development copy, so download a new version manually when you want one.'
    });
    return;
  }
  updateCheckIsManual = true;
  check();
}

/* --------------------------------------------------------------------- menu */

function about(){
  dialog.showMessageBox(win, {
    type: 'info',
    message: 'Ember ' + app.getVersion(),
    detail: 'A personal planner: calendar, task board, Eisenhower matrix, routines and notes.\n\n' +
            'Your data is stored on this computer only, and never leaves it. ' +
            'Use File then Back up planner to save a copy or move it to another machine.'
  });
}

function buildMenu(){
  const isMac = process.platform === 'darwin';
  const template = [];
  if(isMac) template.push({role: 'appMenu'});
  template.push(
    {label: 'File', submenu: [
      {label: 'Back up planner…', accelerator: 'CmdOrCtrl+S', click: backup},
      {label: 'Restore from backup…', accelerator: 'CmdOrCtrl+O', click: restore},
      {type: 'separator'},
      {label: 'Open the vault folder', click: () => {
        const dir = vaultDir(readSettings().vault);
        if(dir){ try{ fs.mkdirSync(dir, {recursive: true}); }catch(e){} shell.openPath(dir); }
        else dialog.showMessageBox(win, {type: 'info', message: 'No vault connected yet',
          detail: 'Open Settings in the planner and choose your Obsidian vault.'});
      }},
      {type: 'separator'},
      {label: isMac ? 'Close window' : 'Hide to the tray', accelerator: 'CmdOrCtrl+W',
       click: () => { if(win && !win.isDestroyed()) win.hide(); }},
      {label: 'Quit Ember', accelerator: 'CmdOrCtrl+Q',
       click: () => { quitting = true; app.quit(); }}
    ]},
    {label: 'Edit', submenu: [
      {role: 'undo'}, {role: 'redo'}, {type: 'separator'},
      {role: 'cut'}, {role: 'copy'}, {role: 'paste'}, {role: 'selectAll'}
    ]},
    {label: 'View', submenu: [
      {role: 'reload'}, {type: 'separator'},
      {label: 'Floating timer', accelerator: 'CmdOrCtrl+Shift+T', click: () => {
        if(timerWin && !timerWin.isDestroyed()) closeTimerWindow();
        else { const w = createTimerWindow(); if(!w.isVisible()) w.showInactive(); }
      }},
      {type: 'separator'},
      {role: 'resetZoom'}, {role: 'zoomIn'}, {role: 'zoomOut'}, {type: 'separator'},
      {role: 'togglefullscreen'}
    ]},
    {label: 'Help', submenu: [
      {label: 'Check for updates…', click: checkManually},
      {type: 'separator'},
      {label: 'About Ember', click: about}
    ]}
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if(!app.requestSingleInstanceLock()){
  app.quit();
}else{
  app.on('second-instance', () => {
    showPlanner();
  });
  app.on('before-quit', () => { quitting = true; });
  /* Windows files notifications under the app's id; the installer uses the
     same one, so a development run and an installed copy look the same. */
  if(process.platform === 'win32') app.setAppUserModelId('com.thisuni.ember');

  app.whenReady().then(() => {
    buildMenu();
    buildTray();
    createWindow();
    initUpdater();
    app.on('activate', () => {
      if(BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  /* Deliberately does not quit: the planner window closing is not the app
     ending, or a timer would stop the moment the window was tidied away. */
  app.on('window-all-closed', () => {});
  app.on('quit', stopWatching);
}
