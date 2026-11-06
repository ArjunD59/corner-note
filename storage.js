// storage.js
// Keeps your note safe on disk, in the app's own data folder (it survives restarts and updates):
//   macOS:   ~/Library/Application Support/Corner Note/
//   Windows: %APPDATA%\Corner Note\
//   Linux:   ~/.config/Corner Note/
//
// note.txt          the current note
// note.backup.txt   the version before the last save, in case note.txt is ever damaged
// history/          snapshots you can restore from the right-click menu
const fs = require('fs');
const path = require('path');

const KEEP_SNAPSHOTS = 100;
const SNAPSHOT_EVERY_MS = 2 * 60 * 1000;

// Write to a temp file, flush it to disk, then swap it in. A crash mid-save can't leave a half-written note.
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text, null, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function readIfExists(file) {
  try { return fs.readFileSync(file, 'utf-8'); } catch (e) { return null; }
}

function createStore(dir) {
  const noteFile = path.join(dir, 'note.txt');
  const backupFile = path.join(dir, 'note.backup.txt');
  const historyDir = path.join(dir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  let current = readIfExists(noteFile);
  if (current == null) current = readIfExists(backupFile); // note.txt missing or unreadable: fall back
  if (current == null) current = '';
  let lastSnapshotAt = 0;
  let lastSnapshotText = null;

  function snapshot(text) {
    if (!text || text === lastSnapshotText) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    writeAtomic(path.join(historyDir, `${stamp}.txt`), text);
    lastSnapshotAt = Date.now();
    lastSnapshotText = text;
    const files = fs.readdirSync(historyDir).filter((f) => f.endsWith('.txt')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP_SNAPSHOTS))) {
      try { fs.unlinkSync(path.join(historyDir, f)); } catch (e) {}
    }
  }

  return {
    load() { return current; },

    save(text) {
      if (typeof text !== 'string' || text === current) return;
      const prev = current;
      // Snapshot the old text before big deletions (select all + a stray key, clearing the note),
      // and every couple of minutes while you type.
      const bigDelete = prev.length >= 20 && text.length < prev.length * 0.5;
      if (bigDelete || Date.now() - lastSnapshotAt > SNAPSHOT_EVERY_MS) snapshot(prev);
      if (prev) writeAtomic(backupFile, prev);
      writeAtomic(noteFile, text);
      current = text;
    },

    // Newest first: [{ id, time, preview, length }]
    versions(limit = 15) {
      let files = [];
      try { files = fs.readdirSync(historyDir).filter((f) => f.endsWith('.txt')).sort().reverse(); } catch (e) {}
      const out = [];
      for (const f of files) {
        const text = readIfExists(path.join(historyDir, f));
        if (!text || text === current) continue;
        const iso = f.replace('.txt', '').replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z');
        out.push({ id: f, time: new Date(iso), preview: text.replace(/\s+/g, ' ').trim().slice(0, 40), length: text.length });
        if (out.length >= limit) break;
      }
      return out;
    },

    // Restoring snapshots the current text first, so a restore can itself be undone.
    restore(id) {
      if (!/^[\w-]+\.txt$/.test(id)) return null;
      const text = readIfExists(path.join(historyDir, id));
      if (text == null) return null;
      snapshot(current);
      lastSnapshotAt = 0;
      this.save(text);
      return text;
    },

    paths: { noteFile, backupFile, historyDir }
  };
}

module.exports = { createStore, writeAtomic };
