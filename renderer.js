// renderer.js
const textarea = document.getElementById('note');
const note = window.cornerNote;

let saveTimeout;
let ready = false;

function saveSoon() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => note.save(textarea.value), 250);
}

function saveNow() {
  clearTimeout(saveTimeout);
  if (ready) note.saveNow(textarea.value);
}

// Load the saved note
note.load().then((text) => {
  textarea.value = text || '';
  ready = true;
});

// Auto-save while typing, and right away when you click away or the window closes
textarea.addEventListener('input', () => { if (ready) saveSoon(); });
textarea.addEventListener('blur', saveNow);
window.addEventListener('beforeunload', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

// "Restore an earlier version" from the right-click menu
note.onRestored((text) => {
  textarea.value = text;
  textarea.focus();
});
