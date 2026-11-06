// preload.js
// The only bridge between the note window and the disk.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cornerNote', {
  load: () => ipcRenderer.invoke('note:load'),
  save: (text) => ipcRenderer.send('note:save', text),
  saveNow: (text) => ipcRenderer.sendSync('note:save-now', text),
  onRestored: (fn) => ipcRenderer.on('note:restored', (e, text) => fn(text))
});
