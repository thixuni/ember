/*
 * The only bridge between the planner and the desktop shell.
 *
 * The renderer stays sandboxed: no Node, no require, no filesystem. It gets
 * this small, explicit surface instead, and everything it can reach is
 * listed here. In a plain browser `window.orbit` is simply absent, which is
 * how the app knows to hide the features that need a real machine.
 */
const {contextBridge, ipcRenderer, webUtils} = require('electron');

contextBridge.exposeInMainWorld('orbit', {
  version: 1,

  /* Electron 32 removed File.path; this is the supported replacement. */
  pathFor(file){
    try{ return webUtils.getPathForFile(file); }catch(e){ return ""; }
  },

  /* ---- Obsidian vault ---- */
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  forgetVault: () => ipcRenderer.invoke('vault:forget'),
  openVault:   () => ipcRenderer.send('vault:open'),
  useVault:  path => ipcRenderer.send('vault:use', path),
  writeDoc:  doc  => ipcRenderer.send('doc:write', doc),
  deleteDoc: doc  => ipcRenderer.send('doc:delete', doc),
  /* Fires when a .md file the planner owns is edited inside Obsidian. */
  onVaultChange: fn => ipcRenderer.on('vault:changed', (e, d) => fn(d)),

  /* ---- attachments ---- */
  saveFile: p => { try{ return ipcRenderer.sendSync('file:save', p); }catch(e){ return null; } },
  openFile: p => ipcRenderer.send('file:open', p),

  /* ---- automatic backups ---- */
  chooseBackupDir: () => ipcRenderer.invoke("backup:dir"),
  writeBackup: job => ipcRenderer.invoke("backup:write", job),

  /* ---- Google Calendar ----
     The page never sees a token: it asks, and the main process signs the
     request. See gcal.js. */
  gcalConnect:    input => ipcRenderer.invoke('gcal:connect', input),
  gcalCancel:     ()    => ipcRenderer.invoke('gcal:cancel'),
  gcalDisconnect: ()    => ipcRenderer.invoke('gcal:disconnect'),
  gcalStatus:     ()    => ipcRenderer.invoke('gcal:status'),
  gcalRequest:    req   => ipcRenderer.invoke('gcal:request', req),

  /* ---- reminders ----
     The planner sends the whole list whenever it changes; the shell holds
     the timers and shows the notifications. */
  scheduleReminders: list => ipcRenderer.send('remind:schedule', list),
  testReminder:      msg  => ipcRenderer.send('remind:test', msg),
  onReminderOpen:    fn   => ipcRenderer.on('remind:open', (e, d) => fn(d)),

  /* ---- the floating timer ---- */
  timer:    state => ipcRenderer.send('timer:state', state),
  popTimer: ()    => ipcRenderer.send('timer:pop'),
  /* Pause, resume, stop pressed on the floating window. */
  onTimerCmd: fn  => ipcRenderer.on('timer:cmd', (e, d) => fn(d))
});
