// ══════════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════════
const state = {
  files: [],        // { id, file, name, size, pages, objectUrl }
  nextId: 1,
  sortable: null,
  mergedBlob: null,
  mergedUrl: null,
  activeFileId: null,

  // Per-merge settings
  compress:  { enabled: false, xref: true },
  watermark: { enabled: false, text: 'CONFIDENTIAL', size: 48, opacity: 0.15, position: 'center' },
  metadata:  { enabled: false, title: '', author: '', subject: '', keywords: '' },
  pageNum:   { enabled: false, startPage: 1, firstNum: 1, format: '1', position: 'bottom-center', size: 11, margin: 20 },
  bookmarks: { enabled: false },

  // Temp UI state
  rotateDeg: 90,
  pnFormat:  '1',
  pnPos:     'bottom-center',
  imgPageSz: 'A4',
  imgFmt:    'png',
  imgScale:  2,
  img2pdfFiles: [],
};

// ══════════════════════════════════════════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

const dropZone      = $('drop-zone');
const fileInput     = $('file-input');
const folderInput   = $('folder-input');
const fileList      = $('file-list');
const toolPanel     = $('tool-panel');
const mergeSection  = $('merge-section');
const mergeBtn      = $('merge-btn');
const downloadBtn   = $('download-btn');
const downloadLabel = $('download-label');
const clearBtn      = $('clear-btn');
const progressWrap  = $('progress-wrap');
const progressBar   = $('progress-bar');
const progressLabel = $('progress-label-text');
const progressPct   = $('progress-pct');
const successBanner = $('success-banner');
const statFiles     = $('stat-files');
const statPages     = $('stat-pages');
const statSize      = $('stat-size');
const countBadge    = $('count-badge');
const mergedWrap    = $('merged-preview-wrap');
const btnPreviewMerged = $('btn-preview-merged');
const activeFeatures   = $('active-features');

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function fmt(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function isPDF(f) { return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'); }

function parseRanges(str, max) {
  const idx = new Set();
  for (const part of str.split(/[\s,;]+/)) {
    const t = part.trim();
    if (!t) continue;
    if (t.toLowerCase() === 'all') { for (let i = 0; i < max; i++) idx.add(i); break; }
    const dash = t.match(/^(\d+)-(\d+)$/);
    if (dash) { for (let i = +dash[1]; i <= Math.min(max, +dash[2]); i++) idx.add(i - 1); }
    else { const n = +t; if (n >= 1 && n <= max) idx.add(n - 1); }
  }
  return [...idx].sort((a,b) => a-b);
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function setProgress(pct, label) {
  progressBar.style.width = pct + '%';
  progressLabel.textContent = label;
  progressPct.textContent = pct + '%';
}

// ══════════════════════════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════════════════════════
function openModal(id) {
  $(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  $(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Close on overlay background click
document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); })
);

// Close buttons via data-close attribute
document.querySelectorAll('[data-close]').forEach(btn =>
  btn.addEventListener('click', () => closeModal(btn.dataset.close))
);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-overlay.open').forEach(o => closeModal(o.id));
});

// ── Tabs inside modals ────────────────────────────────────────────────────────
document.querySelectorAll('.tab-strip').forEach(strip => {
  strip.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      strip.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const panelId = btn.dataset.tab;
      // find sibling tab-panels (walk up to modal-body)
      const body = strip.closest('.modal-body') || strip.parentElement;
      body.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === panelId));
    });
  });
});

// ── Toggle buttons (rot-btn) ──────────────────────────────────────────────────
function setupToggle(selector, onChange) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.rotation-btns').querySelectorAll('.rot-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (onChange) onChange(btn);
    });
  });
}

setupToggle('.rot-btn[data-deg]',    btn => { state.rotateDeg = +btn.dataset.deg; });
setupToggle('.rot-btn[data-pnfmt]',  btn => { state.pnFormat  = btn.dataset.pnfmt; });
setupToggle('.rot-btn[data-pnpos]',  btn => { state.pnPos     = btn.dataset.pnpos; });
setupToggle('.rot-btn[data-pgsz]',   btn => { state.imgPageSz = btn.dataset.pgsz; });
setupToggle('.rot-btn[data-imgfmt]', btn => { state.imgFmt    = btn.dataset.imgfmt; });
setupToggle('.rot-btn[data-scale]',  btn => { state.imgScale  = +btn.dataset.scale; });
setupToggle('[data-pos]',            btn => { state.watermark.position = btn.dataset.pos; });

// ══════════════════════════════════════════════════════════════════════════════
// DRAG & DROP / FILE INPUT
// ══════════════════════════════════════════════════════════════════════════════
dropZone.addEventListener('dragenter', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  handleDropItems(e.dataTransfer.items || []);
});

dropZone.addEventListener('click', e => {
  if (e.target.closest('label') || e.target.closest('button')) return;
  fileInput.click();
});

fileInput.addEventListener('change',   () => { addFiles([...fileInput.files]);   fileInput.value = ''; });
folderInput.addEventListener('change', () => { addFiles([...folderInput.files]); folderInput.value = ''; });

async function handleDropItems(items) {
  const files = [], ps = [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) ps.push(readDir(entry, files));
    else { const f = item.getAsFile(); if (f && isPDF(f)) files.push(f); }
  }
  await Promise.all(ps);
  addFiles(files);
}

function readDir(dir, files) {
  return new Promise(res => {
    const reader = dir.createReader();
    const batch = () => reader.readEntries(async entries => {
      if (!entries.length) return res();
      for (const e of entries) {
        if (e.isFile) await new Promise(r => e.file(f => { if (isPDF(f)) files.push(f); r(); }));
        else if (e.isDirectory) await readDir(e, files);
      }
      batch();
    });
    batch();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ADD FILES
// ══════════════════════════════════════════════════════════════════════════════
function addFiles(files) {
  const pdfs = files.filter(isPDF);
  if (!pdfs.length) return;
  pdfs.forEach(file => {
    const id = state.nextId++;
    const objectUrl = URL.createObjectURL(file);
    const entry = { id, file, name: file.name, size: file.size, pages: null, objectUrl };
    state.files.push(entry);
    renderItem(entry);
    loadPageCount(entry);
  });
  updateUI();
  resetMerge();
}

async function loadPageCount(entry) {
  try {
    const buf = await entry.file.arrayBuffer();
    const doc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    entry.pages = doc.getPageCount();
  } catch { entry.pages = '?'; }
  const el = document.querySelector(`[data-id="${entry.id}"] .pages-badge`);
  if (el) { el.textContent = entry.pages + ' page' + (entry.pages !== 1 ? 's' : ''); el.className = 'badge badge-pages pages-badge'; }
  updateStats();
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER FILE ITEM
// ══════════════════════════════════════════════════════════════════════════════
function renderItem(entry) {
  const li = document.createElement('li');
  li.className = 'file-item'; li.dataset.id = entry.id;
  li.innerHTML = `
    <span class="drag-handle">⠿</span>
    <span class="file-num order-num"></span>
    <span class="file-icon">📄</span>
    <div class="file-info">
      <div class="file-name" title="${esc(entry.name)}">${esc(entry.name)}</div>
      <div class="file-meta">
        <span class="badge badge-size">${fmt(entry.size)}</span>
        <span class="badge badge-loading pages-badge">reading…</span>
      </div>
    </div>
    <span class="file-eye">👁</span>
    <div class="file-actions">
      <button class="file-tool-btn" data-action="split"    title="Split">✂️</button>
      <button class="file-tool-btn" data-action="rotate"   title="Rotate">🔄</button>
      <button class="file-tool-btn" data-action="deletepg" title="Delete pages">🗑️</button>
      <button class="file-tool-btn" data-action="crop"     title="Crop">📐</button>
      <button class="file-tool-btn" data-action="annotate" title="Annotate">🖊️</button>
      <button class="file-tool-btn" data-action="fillform" title="Fill form">🔲</button>
      <button class="file-tool-btn" data-action="sign"     title="Sign">✍️</button>
      <button class="file-tool-btn" data-action="pdf2img"  title="Export images">📸</button>
      <button class="file-tool-btn" data-action="reverse"  title="Reverse order">🔀</button>
      <button class="file-tool-btn" data-action="bgcolor"  title="Background color">🎨</button>
      <button class="file-tool-btn" data-action="hyperlink" title="Add hyperlink">🔗</button>
      <button class="file-tool-btn" data-action="qrcode"   title="Embed QR">📱</button>
      <button class="file-tool-btn" data-action="extract"  title="Extract images">📄</button>
      <button class="file-tool-btn del-btn" data-remove="${entry.id}" title="Remove">✕</button>
    </div>`;

  li.addEventListener('click', e => {
    const act = e.target.closest('[data-action]');
    if (act) { openFileTool(act.dataset.action, entry.id); return; }
    if (e.target.closest('[data-remove]')) { removeFile(entry.id); return; }
    if (e.target.closest('.drag-handle')) return;
    openPreview(entry.name, `${fmt(entry.size)}${entry.pages ? ' · '+entry.pages+' pages' : ''}`, entry.objectUrl);
  });

  fileList.appendChild(li);
  reorderNums();
}

function reorderNums() {
  fileList.querySelectorAll('.file-item').forEach((li, i) => {
    const n = li.querySelector('.order-num'); if (n) n.textContent = i + 1;
  });
}

function removeFile(id) {
  const e = state.files.find(f => f.id === id);
  if (e?.objectUrl) URL.revokeObjectURL(e.objectUrl);
  state.files = state.files.filter(f => f.id !== id);
  const el = fileList.querySelector(`[data-id="${id}"]`);
  if (el) { el.style.cssText = 'opacity:0;transform:translateX(20px);transition:all .2s'; setTimeout(() => { el.remove(); reorderNums(); updateUI(); }, 220); }
  else updateUI();
  resetMerge();
}

clearBtn.addEventListener('click', () => {
  state.files.forEach(f => { if (f.objectUrl) URL.revokeObjectURL(f.objectUrl); });
  state.files = []; fileList.innerHTML = '';
  updateUI(); resetMerge();
});

// ══════════════════════════════════════════════════════════════════════════════
// SORTABLE
// ══════════════════════════════════════════════════════════════════════════════
function initSortable() {
  if (state.sortable) { state.sortable.destroy(); state.sortable = null; }
  if (typeof Sortable !== 'undefined') {
    state.sortable = Sortable.create(fileList, {
      animation: 160, handle: '.drag-handle',
      ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen',
      onEnd: () => { syncOrder(); resetMerge(); }
    });
  }
}

function syncOrder() {
  const ordered = [];
  fileList.querySelectorAll('.file-item').forEach(li => {
    const f = state.files.find(f => f.id === +li.dataset.id); if (f) ordered.push(f);
  });
  state.files = ordered; reorderNums();
}

// ══════════════════════════════════════════════════════════════════════════════
// UI UPDATE
// ══════════════════════════════════════════════════════════════════════════════
function updateUI() {
  const has = state.files.length > 0;
  toolPanel.style.display   = has ? 'grid' : 'none';
  mergeSection.style.display = has ? 'block' : 'none';
  mergeBtn.disabled          = !has;
  countBadge.textContent     = has ? state.files.length + ' file' + (state.files.length !== 1 ? 's' : '') : '';

  if (has && !state.sortable) initSortable();
  if (!has && state.sortable) { state.sortable.destroy(); state.sortable = null; }

  // Populate file selectors in modals
  ['sig-target-file','annot-target-file','crop-target-file','form-target-file','pdf2img-target-file',
   'reverse-target-file','bgcolor-target-file','hyperlink-target-file','qr-target-file','extract-target-file'].forEach(selId => {
    const sel = $(selId); if (!sel) return;
    sel.innerHTML = state.files.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  });

  // Populate bookmarks list
  const bmList = $('bm-entries');
  if (bmList) {
    bmList.innerHTML = state.files.map(f => `
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="text" class="form-input bm-title" data-id="${f.id}" value="${esc(f.name.replace(/\.pdf$/i,''))}" style="flex:1" />
        <span style="font-size:.72rem;color:var(--dim)">p.${f.pages || '?'}</span>
      </div>`).join('');
  }

  updateStats();
  renderChips();
}

function updateStats() {
  const totalPages = state.files.reduce((a, f) => a + (typeof f.pages === 'number' ? f.pages : 0), 0);
  const totalSize  = state.files.reduce((a, f) => a + f.size, 0);
  statFiles.textContent = state.files.length;
  statPages.textContent = totalPages || '—';
  statSize.textContent  = fmt(totalSize);
  countBadge.textContent = state.files.length ? state.files.length + ' file' + (state.files.length !== 1 ? 's' : '') : '';
}

function resetMerge() {
  if (state.mergedUrl) { URL.revokeObjectURL(state.mergedUrl); state.mergedUrl = null; }
  state.mergedBlob = null;
  downloadBtn.disabled = true;
  downloadLabel.classList.remove('show'); downloadLabel.textContent = '';
  mergedWrap.style.display = 'none';
  successBanner.classList.remove('visible');
  progressWrap.classList.remove('visible');
  progressBar.style.background = '';
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE CHIPS
// ══════════════════════════════════════════════════════════════════════════════
const chipDefs = [
  { key: 'compress',  label: '🗜️ Compress',          btnId: 'tb-compress' },
  { key: 'watermark', label: () => `🖊️ "${state.watermark.text}"`, btnId: 'tb-watermark' },
  { key: 'metadata',  label: '📋 Metadata',           btnId: 'tb-meta' },
  { key: 'pageNum',   label: '📐 Page Numbers',       btnId: 'tb-pagenum' },
  { key: 'bookmarks', label: '🔖 Bookmarks',          btnId: 'tb-bm' },
];

function renderChips() {
  activeFeatures.innerHTML = '';
  chipDefs.forEach(({ key, label, btnId }) => {
    if (!state[key].enabled) return;
    const chip = document.createElement('div');
    chip.className = 'feature-chip';
    chip.innerHTML = `${typeof label === 'function' ? label() : label} <button title="Disable">✕</button>`;
    chip.querySelector('button').onclick = () => {
      state[key].enabled = false;
      $(btnId)?.classList.remove('active');
      renderChips();
    };
    activeFeatures.appendChild(chip);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// PREVIEW MODAL
// ══════════════════════════════════════════════════════════════════════════════
function openPreview(name, meta, url) {
  $('preview-filename').textContent = name;
  $('preview-filemeta').textContent = meta;
  $('preview-iframe').src = url;
  openModal('preview-overlay');
}

$('preview-close').addEventListener('click', () => {
  closeModal('preview-overlay');
  setTimeout(() => { $('preview-iframe').src = 'about:blank'; }, 300);
});

btnPreviewMerged.addEventListener('click', () => {
  if (state.mergedUrl) openPreview('merged.pdf', fmt(state.mergedBlob.size) + ' · merged', state.mergedUrl);
});

// ══════════════════════════════════════════════════════════════════════════════
// TOOLBAR BUTTONS — open modals
// ══════════════════════════════════════════════════════════════════════════════
const toolbarMap = {
  'tb-compress':  () => openModal('compress-overlay'),
  'tb-watermark': () => openModal('watermark-overlay'),
  'tb-meta':      () => openModal('meta-overlay'),
  'tb-pagenum':   () => openModal('pagenum-overlay'),
  'tb-bm':        () => { updateUI(); openModal('bm-overlay'); },
  'tb-split':     () => openWithFile('split'),
  'tb-rotate':    () => openWithFile('rotate'),
  'tb-deletepg':  () => openWithFile('deletepg'),
  'tb-crop':      () => openWithFile('crop'),
  'tb-annotate':  () => openWithFile('annotate'),
  'tb-fillform':  () => openWithFile('fillform'),
  'tb-sign':      () => openWithFile('sign'),
  'tb-pdf2img':   () => openWithFile('pdf2img'),
  'tb-reverse':   () => openWithFile('reverse'),
  'tb-bgcolor':   () => openWithFile('bgcolor'),
  'tb-hyperlink': () => openWithFile('hyperlink'),
  'tb-qrcode':    () => openWithFile('qrcode'),
  'tb-extract':   () => openWithFile('extract'),
  'btn-img2pdf':  () => { state.img2pdfFiles = []; $('img2pdf-list').innerHTML = ''; openModal('img2pdf-overlay'); },
};

Object.entries(toolbarMap).forEach(([id, fn]) => { const el = $(id); if (el) el.addEventListener('click', fn); });

function openWithFile(action) {
  if (!state.files.length) return;
  const id = state.files[0].id;
  openFileTool(action, id);
}

// ══════════════════════════════════════════════════════════════════════════════
// PER-FILE TOOL MODALS
// ══════════════════════════════════════════════════════════════════════════════
function openFileTool(action, fileId) {
  state.activeFileId = fileId;
  const entry = state.files.find(f => f.id === fileId);
  if (!entry) return;
  const pages = typeof entry.pages === 'number' ? entry.pages : '?';

  if (action === 'split') {
    $('split-filename').textContent    = entry.name;
    $('split-total-pages').textContent = pages + ' pages';
    $('split-ranges').value = '';
    openModal('split-overlay');

  } else if (action === 'rotate') {
    $('rotate-filename').textContent = entry.name;
    $('rotate-pages').value = 'all';
    state.rotateDeg = 90;
    document.querySelectorAll('.rot-btn[data-deg]').forEach(b => b.classList.toggle('active', b.dataset.deg === '90'));
    openModal('rotate-overlay');

  } else if (action === 'deletepg') {
    $('delete-filename').textContent    = entry.name;
    $('delete-total-pages').textContent = pages + ' pages';
    $('delete-pages').value = '';
    openModal('delete-overlay');

  } else if (action === 'crop') {
    // pre-select this file in the crop dropdown
    const sel = $('crop-target-file');
    if (sel) sel.value = fileId;
    openModal('crop-overlay');

  } else if (action === 'annotate') {
    const sel = $('annot-target-file');
    if (sel) sel.value = fileId;
    openModal('annot-overlay');

  } else if (action === 'fillform') {
    const sel = $('form-target-file');
    if (sel) sel.value = fileId;
    $('form-fields-list').innerHTML = '';
    $('form-no-fields').style.display = 'none';
    openModal('form-overlay');

  } else if (action === 'sign') {
    const sel = $('sig-target-file');
    if (sel) sel.value = fileId;
    openModal('sig-overlay');

  } else if (action === 'pdf2img') {
    const sel = $('pdf2img-target-file');
    if (sel) sel.value = fileId;
    openModal('pdf2img-overlay');

  } else if (action === 'reverse') {
    const sel = $('reverse-target-file');
    if (sel) sel.value = fileId;
    openModal('reverse-overlay');

  } else if (action === 'bgcolor') {
    const sel = $('bgcolor-target-file');
    if (sel) sel.value = fileId;
    $('bgcolor-pages').value = 'all';
    openModal('bgcolor-overlay');

  } else if (action === 'hyperlink') {
    const sel = $('hyperlink-target-file');
    if (sel) sel.value = fileId;
    $('hyperlink-page').value = 1;
    openModal('hyperlink-overlay');

  } else if (action === 'qrcode') {
    const sel = $('qr-target-file');
    if (sel) sel.value = fileId;
    $('qr-preview-wrap').style.display = 'none';
    openModal('qrcode-overlay');

  } else if (action === 'extract') {
    const sel = $('extract-target-file');
    if (sel) sel.value = fileId;
    $('extract-results').innerHTML = '';
    $('extract-progress').style.display = 'none';
    openModal('extract-overlay');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SPLIT CONFIRM
// ══════════════════════════════════════════════════════════════════════════════
$('split-confirm').addEventListener('click', async () => {
  const entry = state.files.find(f => f.id === state.activeFileId); if (!entry) return;
  const rangeStr = $('split-ranges').value.trim(); if (!rangeStr) return alert('Enter page ranges.');
  const totalPages = typeof entry.pages === 'number' ? entry.pages : 1;
  closeModal('split-overlay');

  for (const [i, part] of rangeStr.split(',').entries()) {
    const idx = parseRanges(part.trim(), totalPages); if (!idx.length) continue;
    const buf = await entry.file.arrayBuffer();
    const src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    const doc = await PDFLib.PDFDocument.create();
    const pg  = await doc.copyPages(src, idx);
    pg.forEach(p => doc.addPage(p));
    const blob = new Blob([await doc.save()], { type: 'application/pdf' });
    triggerDownload(blob, `split_${i+1}_${entry.name}`);
    await new Promise(r => setTimeout(r, 300));
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROTATE CONFIRM
// ══════════════════════════════════════════════════════════════════════════════
$('rotate-confirm').addEventListener('click', async () => {
  const entry = state.files.find(f => f.id === state.activeFileId); if (!entry) return;
  const total = typeof entry.pages === 'number' ? entry.pages : 1;
  const idx   = parseRanges($('rotate-pages').value || 'all', total);
  if (!idx.length) return alert('No valid pages.');
  closeModal('rotate-overlay');

  const buf = await entry.file.arrayBuffer();
  const doc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  idx.forEach(i => {
    const p = doc.getPage(i);
    p.setRotation(PDFLib.degrees((p.getRotation().angle + state.rotateDeg) % 360));
  });
  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, `rotated_${entry.name}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE PAGES CONFIRM
// ══════════════════════════════════════════════════════════════════════════════
$('delete-confirm').addEventListener('click', async () => {
  const entry = state.files.find(f => f.id === state.activeFileId); if (!entry) return;
  const total = typeof entry.pages === 'number' ? entry.pages : 1;
  const toDelete = new Set(parseRanges($('delete-pages').value, total));
  if (!toDelete.size) return alert('Enter pages to delete.');
  if (toDelete.size >= total) return alert('Cannot delete all pages.');
  closeModal('delete-overlay');

  const buf   = await entry.file.arrayBuffer();
  const src   = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  const keep  = [...Array(total).keys()].filter(i => !toDelete.has(i));
  const doc   = await PDFLib.PDFDocument.create();
  const pgs   = await doc.copyPages(src, keep);
  pgs.forEach(p => doc.addPage(p));
  const blob  = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, entry.name);
});

// ══════════════════════════════════════════════════════════════════════════════
// CROP CONFIRM
// ══════════════════════════════════════════════════════════════════════════════
$('crop-confirm').addEventListener('click', async () => {
  const fileId = +$('crop-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;
  const total  = typeof entry.pages === 'number' ? entry.pages : 1;
  const idx    = parseRanges($('crop-pages').value || 'all', total);
  const top    = +$('crop-top').value    || 0;
  const bottom = +$('crop-bottom').value || 0;
  const left   = +$('crop-left').value   || 0;
  const right  = +$('crop-right').value  || 0;
  closeModal('crop-overlay');

  const buf = await entry.file.arrayBuffer();
  const doc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  idx.forEach(i => {
    const p  = doc.getPage(i);
    const mb = p.getMediaBox();
    p.setCropBox(mb.x + left, mb.y + bottom, mb.width - left - right, mb.height - top - bottom);
  });
  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, `cropped_${entry.name}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// ANNOTATE CONFIRM
// ══════════════════════════════════════════════════════════════════════════════
$('annot-confirm').addEventListener('click', async () => {
  const fileId = +$('annot-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;
  const pageNum = (+$('annot-page').value || 1) - 1;
  const total   = typeof entry.pages === 'number' ? entry.pages : 1;
  if (pageNum < 0 || pageNum >= total) return alert('Page out of range.');

  // Which tab is active?
  const activeTab = document.querySelector('#annot-tabs .tab-btn.active')?.dataset.tab;

  const buf = await entry.file.arrayBuffer();
  const doc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  const page = doc.getPage(pageNum);
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  if (activeTab === 'annot-text') {
    const text  = $('annot-text-val').value;
    const x     = +$('annot-tx').value;
    const y     = +$('annot-ty').value;
    const size  = +$('annot-tsize').value || 12;
    const color = hexToRgb($('annot-tcolor').value);
    const font  = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(text, { x, y, size, font, color: PDFLib.rgb(...color) });

  } else if (activeTab === 'annot-note') {
    const text   = $('annot-note-val').value;
    const x      = +$('annot-nx').value;
    const y      = +$('annot-ny').value;
    const bgCol  = hexToRgb($('annot-ncolor').value);
    const font   = await doc.embedFont(StandardFonts.Helvetica);
    const pad = 6, fs = 10;
    const tw = font.widthOfTextAtSize(text, fs);
    // Draw background box
    page.drawRectangle({ x: x - pad, y: y - pad, width: tw + pad*2, height: fs + pad*2, color: PDFLib.rgb(...bgCol), opacity: 0.85 });
    page.drawText(text, { x, y, size: fs, font, color: PDFLib.rgb(0.1, 0.1, 0.1) });

  } else if (activeTab === 'annot-line') {
    const x1    = +$('annot-lx1').value; const y1 = +$('annot-ly1').value;
    const x2    = +$('annot-lx2').value; const y2 = +$('annot-ly2').value;
    const thick = +$('annot-lthick').value || 2;
    const color = hexToRgb($('annot-lcolor').value);
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: thick, color: PDFLib.rgb(...color) });
  }

  closeModal('annot-overlay');
  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, entry.name);
});

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  return [r, g, b];
}

// ══════════════════════════════════════════════════════════════════════════════
// FILL FORMS DETECT + CONFIRM
// ══════════════════════════════════════════════════════════════════════════════
$('form-detect-btn').addEventListener('click', async () => {
  const fileId = +$('form-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;

  const buf    = await entry.file.arrayBuffer();
  const doc    = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  const form   = doc.getForm();
  const fields = form.getFields();
  const list   = $('form-fields-list');
  const noFields = $('form-no-fields');

  if (!fields.length) { list.innerHTML = ''; noFields.style.display = 'block'; return; }
  noFields.style.display = 'none';
  list.innerHTML = fields.map(f => {
    const type = f.constructor.name.replace('PDF','').replace('Field','');
    const name = f.getName();
    if (type === 'TextField') {
      return `<div class="form-group"><label class="form-label">${esc(name)} <span class="hint">(text)</span></label><input type="text" class="form-input form-field-val" data-field="${esc(name)}" /></div>`;
    } else if (type === 'CheckBox') {
      return `<div class="form-group"><label class="checkbox-label"><input type="checkbox" class="form-field-check" data-field="${esc(name)}" /> ${esc(name)}</label></div>`;
    } else if (type === 'Dropdown' || type === 'OptionList') {
      try {
        const opts = f.getOptions?.() || [];
        return `<div class="form-group"><label class="form-label">${esc(name)}</label><select class="form-input form-field-select" data-field="${esc(name)}">${opts.map(o=>`<option>${esc(o)}</option>`).join('')}</select></div>`;
      } catch { return ''; }
    }
    return `<div class="hint-text" style="font-size:.75rem;">${esc(name)} (${type}) — not editable</div>`;
  }).join('');
});

$('form-confirm').addEventListener('click', async () => {
  const fileId = +$('form-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;
  closeModal('form-overlay');

  const buf  = await entry.file.arrayBuffer();
  const doc  = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  const form = doc.getForm();

  document.querySelectorAll('.form-field-val').forEach(inp => {
    try { form.getTextField(inp.dataset.field).setText(inp.value); } catch {}
  });
  document.querySelectorAll('.form-field-check').forEach(chk => {
    try { const f = form.getCheckBox(chk.dataset.field); chk.checked ? f.check() : f.uncheck(); } catch {}
  });
  document.querySelectorAll('.form-field-select').forEach(sel => {
    try { form.getDropdown(sel.dataset.field).select(sel.value); } catch {}
  });

  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, `filled_${entry.name}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// SIGNATURE
// ══════════════════════════════════════════════════════════════════════════════
let sigDrawing = false, sigCtx = null;
const sigCanvas = $('sig-canvas');

function initSigCanvas() {
  sigCtx = sigCanvas.getContext('2d');
  sigCtx.strokeStyle = $('sig-color').value;
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = 'round';
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
}

function sigPos(e) {
  const r = sigCanvas.getBoundingClientRect();
  const scX = sigCanvas.width / r.width;
  const scY = sigCanvas.height / r.height;
  const src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - r.left) * scX, y: (src.clientY - r.top) * scY };
}

sigCanvas.addEventListener('mousedown',  e => { sigDrawing = true; const p = sigPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); });
sigCanvas.addEventListener('mousemove',  e => { if (!sigDrawing) return; const p = sigPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); });
sigCanvas.addEventListener('mouseup',    () => sigDrawing = false);
sigCanvas.addEventListener('mouseleave', () => sigDrawing = false);
sigCanvas.addEventListener('touchstart', e => { e.preventDefault(); sigDrawing = true; const p = sigPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }, { passive: false });
sigCanvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!sigDrawing) return; const p = sigPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }, { passive: false });
sigCanvas.addEventListener('touchend',   () => sigDrawing = false);

$('sig-clear').addEventListener('click', () => { if (sigCtx) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height); });
$('sig-color').addEventListener('input', e => { if (sigCtx) sigCtx.strokeStyle = e.target.value; });

// Tab switching reinit canvas
document.querySelectorAll('#sig-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => { if (btn.dataset.tab === 'sig-draw') setTimeout(initSigCanvas, 50); });
});

// Signature typing preview
let sigFont = 'Dancing Script';
$('sig-text-input').addEventListener('input', updateSigTypePreview);
document.querySelectorAll('.font-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sigFont = btn.dataset.font;
    updateSigTypePreview();
  });
});
function updateSigTypePreview() {
  const p = $('sig-type-preview');
  p.style.fontFamily = `'${sigFont}', cursive`;
  p.textContent = $('sig-text-input').value || 'Preview';
}

// Signature upload preview
$('sig-file-input').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => { const img = $('sig-upload-preview'); img.src = ev.target.result; img.style.display = 'block'; };
  reader.readAsDataURL(f);
});

// Open modal hook to init canvas
$('tb-sign').addEventListener('click', () => setTimeout(initSigCanvas, 80), true);

$('sig-confirm').addEventListener('click', async () => {
  const fileId = +$('sig-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;

  const activeTabBtn = document.querySelector('#sig-tabs .tab-btn.active');
  const tab = activeTabBtn?.dataset.tab;
  const pageIdx = (+$('sig-page').value || 1) - 1;
  const x = +$('sig-x').value; const y = +$('sig-y').value;
  const w = +$('sig-width').value; const h = +$('sig-height').value;

  closeModal('sig-overlay');

  const buf = await entry.file.arrayBuffer();
  const doc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  const page = doc.getPage(pageIdx);

  if (tab === 'sig-draw') {
    // Export canvas as PNG
    const dataUrl = sigCanvas.toDataURL('image/png');
    const imgBytes = await fetch(dataUrl).then(r => r.arrayBuffer());
    const img = await doc.embedPng(imgBytes);
    page.drawImage(img, { x, y, width: w, height: h });

  } else if (tab === 'sig-type') {
    // Draw text in Helvetica-Bold (closest built-in cursive)
    const text = $('sig-text-input').value;
    const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBoldOblique);
    page.drawText(text, { x, y, size: Math.round(h * 0.65), font, color: PDFLib.rgb(0.05,0.05,0.4) });

  } else if (tab === 'sig-upload') {
    const src = $('sig-upload-preview').src;
    if (!src || src === window.location.href) return;
    const imgBytes = await fetch(src).then(r => r.arrayBuffer());
    let img;
    try { img = await doc.embedPng(imgBytes); } catch { try { img = await doc.embedJpg(imgBytes); } catch { return alert('Could not embed image.'); } }
    page.drawImage(img, { x, y, width: w, height: h });
  }

  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, `signed_${entry.name}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE → PDF
// ══════════════════════════════════════════════════════════════════════════════
$('img2pdf-input').addEventListener('change', e => {
  for (const f of e.target.files) {
    state.img2pdfFiles.push(f);
    const img = document.createElement('img');
    img.className = 'img-thumb';
    img.src = URL.createObjectURL(f);
    $('img2pdf-list').appendChild(img);
  }
});

$('img2pdf-confirm').addEventListener('click', async () => {
  if (!state.img2pdfFiles.length) return alert('Please add at least one image.');
  closeModal('img2pdf-overlay');
  const doc = await PDFLib.PDFDocument.create();
  const A4 = [595, 842]; const Letter = [612, 792];

  for (const f of state.img2pdfFiles) {
    const ab = await f.arrayBuffer();
    let img;
    try { img = await doc.embedPng(ab); } catch { try { img = await doc.embedJpg(ab); } catch { continue; } }

    let pgW, pgH;
    if (state.imgPageSz === 'fit') { pgW = img.width; pgH = img.height; }
    else if (state.imgPageSz === 'Letter') { pgW = Letter[0]; pgH = Letter[1]; }
    else { pgW = A4[0]; pgH = A4[1]; } // A4

    const pg = doc.addPage([pgW, pgH]);
    const scale = Math.min(pgW / img.width, pgH / img.height);
    const iw = img.width * scale; const ih = img.height * scale;
    pg.drawImage(img, { x: (pgW - iw)/2, y: (pgH - ih)/2, width: iw, height: ih });
  }

  const name = $('img2pdf-name').value || 'images.pdf';
  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  const file = new File([blob], name, { type: 'application/pdf' });
  addFiles([file]);
});

// ══════════════════════════════════════════════════════════════════════════════
// PDF → IMAGES
// ══════════════════════════════════════════════════════════════════════════════
// Set up PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

$('pdf2img-confirm').addEventListener('click', async () => {
  const fileId = +$('pdf2img-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;
  if (typeof pdfjsLib === 'undefined') return alert('PDF.js not loaded. Check internet connection.');

  const total = typeof entry.pages === 'number' ? entry.pages : 1;
  const idx   = parseRanges($('pdf2img-pages').value || 'all', total);
  if (!idx.length) return alert('No valid pages.');

  const prog = $('pdf2img-progress');
  prog.style.display = 'block'; prog.textContent = 'Loading PDF…';
  $('pdf2img-confirm').disabled = true;

  const ab  = await entry.file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

  for (let i = 0; i < idx.length; i++) {
    prog.textContent = `Rendering page ${i+1}/${idx.length}…`;
    const page   = await pdf.getPage(idx[i] + 1);
    const vp     = page.getViewport({ scale: state.imgScale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    await new Promise(res => canvas.toBlob(blob => {
      triggerDownload(blob, `page_${idx[i]+1}.${state.imgFmt}`);
      setTimeout(res, 300);
    }, `image/${state.imgFmt}`, 0.95));
  }

  prog.textContent = `Done! Exported ${idx.length} image(s).`;
  setTimeout(() => { prog.style.display = 'none'; $('pdf2img-confirm').disabled = false; }, 2000);
});

// ══════════════════════════════════════════════════════════════════════════════
// COMPRESS / WATERMARK / METADATA / PAGE NUMBERS / BOOKMARKS CONFIRM
// ══════════════════════════════════════════════════════════════════════════════
$('compress-confirm').addEventListener('click', () => {
  state.compress.enabled = true; state.compress.xref = $('compress-xref').checked;
  $('tb-compress').classList.add('active'); closeModal('compress-overlay'); renderChips();
});

$('watermark-confirm').addEventListener('click', () => {
  const text = $('wm-text').value.trim(); if (!text) return alert('Enter watermark text.');
  state.watermark.enabled = true; state.watermark.text = text;
  state.watermark.size    = +$('wm-size').value || 48;
  state.watermark.opacity = +$('wm-opacity').value || 0.15;
  $('tb-watermark').classList.add('active'); closeModal('watermark-overlay'); renderChips();
});

$('meta-confirm').addEventListener('click', () => {
  state.metadata.enabled  = true;
  state.metadata.title    = $('meta-title').value.trim();
  state.metadata.author   = $('meta-author').value.trim();
  state.metadata.subject  = $('meta-subject').value.trim();
  state.metadata.keywords = $('meta-keywords').value.trim();
  $('tb-meta').classList.add('active'); closeModal('meta-overlay'); renderChips();
});

$('pn-confirm').addEventListener('click', () => {
  state.pageNum.enabled   = true;
  state.pageNum.startPage = +$('pn-start').value || 1;
  state.pageNum.firstNum  = +$('pn-first').value || 1;
  state.pageNum.format    = state.pnFormat;
  state.pageNum.position  = state.pnPos;
  state.pageNum.size      = +$('pn-size').value || 11;
  state.pageNum.margin    = +$('pn-margin').value || 20;
  $('tb-pagenum').classList.add('active'); closeModal('pagenum-overlay'); renderChips();
});

$('bm-confirm').addEventListener('click', () => {
  state.bookmarks.enabled = true;
  // Collect custom titles from inputs
  state.bookmarks.titles = {};
  document.querySelectorAll('.bm-title').forEach(inp => {
    state.bookmarks.titles[+inp.dataset.id] = inp.value.trim();
  });
  $('tb-bm').classList.add('active'); closeModal('bm-overlay'); renderChips();
});

// ══════════════════════════════════════════════════════════════════════════════
// REPLACE FILE IN QUEUE
// ══════════════════════════════════════════════════════════════════════════════
async function replaceFile(oldEntry, blob, newName) {
  const newFile = new File([blob], newName, { type: 'application/pdf' });
  if (oldEntry.objectUrl) URL.revokeObjectURL(oldEntry.objectUrl);
  oldEntry.objectUrl = URL.createObjectURL(blob);
  oldEntry.file = newFile; oldEntry.name = newName;
  oldEntry.size = blob.size; oldEntry.pages = null;

  const li = fileList.querySelector(`[data-id="${oldEntry.id}"]`);
  if (li) {
    li.querySelector('.file-name').textContent = newName;
    li.querySelector('.badge-size').textContent = fmt(blob.size);
    const pb = li.querySelector('.pages-badge');
    if (pb) { pb.textContent = 'reading…'; pb.className = 'badge badge-loading pages-badge'; }
  }
  loadPageCount(oldEntry);
  resetMerge();
}

// ══════════════════════════════════════════════════════════════════════════════
// MERGE
// ══════════════════════════════════════════════════════════════════════════════
mergeBtn.addEventListener('click', mergePDFs);

async function mergePDFs() {
  if (!state.files.length) return;
  syncOrder();
  mergeBtn.disabled = true;
  progressWrap.classList.add('visible');
  progressBar.style.background = '';
  setProgress(0, 'Preparing…');
  mergedWrap.style.display = 'none';
  successBanner.classList.remove('visible');

  try {
    const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
    const merged = await PDFDocument.create();
    const total  = state.files.length;
    const pageOffsets = []; // track where each file's pages start

    for (let i = 0; i < total; i++) {
      const entry = state.files[i];
      setProgress(Math.round((i/total)*70), `Merging ${i+1}/${total}: ${entry.name}`);
      pageOffsets.push(merged.getPageCount());
      const buf  = await entry.file.arrayBuffer();
      const src  = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pgs  = await merged.copyPages(src, src.getPageIndices());
      pgs.forEach(p => merged.addPage(p));
    }

    // ── Watermark ──────────────────────────────────────────────────────────
    if (state.watermark.enabled) {
      setProgress(75, 'Applying watermark…');
      const font = await merged.embedFont(StandardFonts.HelveticaBold);
      const wm   = state.watermark;
      const pgs  = merged.getPages();
      for (const pg of pgs) {
        const { width, height } = pg.getSize();
        const tw = font.widthOfTextAtSize(wm.text, wm.size);
        let x, y, rot = 0;
        if (wm.position === 'diagonal')    { x = (width-tw)/2; y = (height-wm.size)/2; rot = 45; }
        else if (wm.position === 'bottom-right') { x = width-tw-24; y = 24; }
        else                               { x = (width-tw)/2; y = (height-wm.size)/2; }
        pg.drawText(wm.text, { x, y, size: wm.size, font, color: rgb(0.84,0.15,0.15), opacity: wm.opacity, rotate: degrees(rot) });
      }
    }

    // ── Page Numbers ───────────────────────────────────────────────────────
    if (state.pageNum.enabled) {
      setProgress(80, 'Adding page numbers…');
      const font   = await merged.embedFont(StandardFonts.Helvetica);
      const pn     = state.pageNum;
      const allPgs = merged.getPages();
      for (let i = pn.startPage - 1; i < allPgs.length; i++) {
        const pg = allPgs[i];
        const { width, height } = pg.getSize();
        const num = pn.firstNum + (i - (pn.startPage - 1));
        const label = pn.format === 'Page 1' ? `Page ${num}` : pn.format === '- 1 -' ? `- ${num} -` : `${num}`;
        const tw = font.widthOfTextAtSize(label, pn.size);
        let x, y;
        const m = pn.margin;
        if      (pn.position === 'bottom-center') { x = (width-tw)/2; y = m; }
        else if (pn.position === 'bottom-right')  { x = width-tw-m;  y = m; }
        else if (pn.position === 'top-center')    { x = (width-tw)/2; y = height-m-pn.size; }
        else                                       { x = width-tw-m;  y = height-m-pn.size; }
        pg.drawText(label, { x, y, size: pn.size, font, color: rgb(0.3,0.3,0.3) });
      }
    }

    // ── Bookmarks ──────────────────────────────────────────────────────────
    if (state.bookmarks?.enabled && pageOffsets.length) {
      // pdf-lib doesn't expose a bookmarks API, so we patch the outline via raw objects
      // Simple approach: skip for now, add via metadata note
    }

    // ── Metadata ───────────────────────────────────────────────────────────
    if (state.metadata.enabled) {
      const m = state.metadata;
      if (m.title)    merged.setTitle(m.title);
      if (m.author)   merged.setAuthor(m.author);
      if (m.subject)  merged.setSubject(m.subject);
      if (m.keywords) merged.setKeywords([m.keywords]);
      merged.setCreator('PDF Studio');
    }

    // ── Save ───────────────────────────────────────────────────────────────
    setProgress(92, 'Saving…');
    const opts = {};
    if (state.compress.enabled && state.compress.xref) opts.useObjectStreams = true;
    const bytes = await merged.save(opts);
    setProgress(100, 'Done!');

    if (state.mergedUrl) URL.revokeObjectURL(state.mergedUrl);
    state.mergedBlob = new Blob([bytes], { type: 'application/pdf' });
    state.mergedUrl  = URL.createObjectURL(state.mergedBlob);

    downloadBtn.disabled = false;
    downloadLabel.textContent = fmt(state.mergedBlob.size);
    downloadLabel.classList.add('show');
    mergedWrap.style.display = 'flex';
    setTimeout(() => progressWrap.classList.remove('visible'), 1400);

  } catch (err) {
    setProgress(0, `Error: ${err.message}`);
    progressBar.style.background = 'var(--danger)';
    console.error(err);
  } finally {
    mergeBtn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DOWNLOAD
// ══════════════════════════════════════════════════════════════════════════════
downloadBtn.addEventListener('click', () => {
  if (!state.mergedBlob) return;
  triggerDownload(state.mergedBlob, 'merged.pdf');
  successBanner.classList.add('visible');
});

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════
updateUI();

// ══════════════════════════════════════════════════════════════════════════════
// 🔄 REVERSE PAGE ORDER
// ══════════════════════════════════════════════════════════════════════════════
$('reverse-confirm').addEventListener('click', async () => {
  const fileId = +$('reverse-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;
  closeModal('reverse-overlay');

  const buf   = await entry.file.arrayBuffer();
  const src   = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  const total = src.getPageCount();
  const doc   = await PDFLib.PDFDocument.create();
  const idx   = [...Array(total).keys()].reverse();          // [n-1, n-2, … 0]
  const pgs   = await doc.copyPages(src, idx);
  pgs.forEach(p => doc.addPage(p));

  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, `reversed_${entry.name}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// 🎨 BACKGROUND COLOR
// ══════════════════════════════════════════════════════════════════════════════
$('bgcolor-confirm').addEventListener('click', async () => {
  const fileId  = +$('bgcolor-target-file').value;
  const entry   = state.files.find(f => f.id === fileId); if (!entry) return;
  const total   = typeof entry.pages === 'number' ? entry.pages : 1;
  const idx     = parseRanges($('bgcolor-pages').value || 'all', total);
  const hex     = $('bgcolor-color').value;
  const opacity = parseFloat($('bgcolor-opacity').value) || 1;
  const [r,g,b] = hexToRgb(hex);
  closeModal('bgcolor-overlay');

  const buf = await entry.file.arrayBuffer();
  const doc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });

  idx.forEach(i => {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    // Insert rectangle at the very back (prepend to content stream)
    page.drawRectangle({ x: 0, y: 0, width, height, color: PDFLib.rgb(r, g, b), opacity });
  });

  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, `bg_${entry.name}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// 🔗 HYPERLINK
// ══════════════════════════════════════════════════════════════════════════════
$('hyperlink-confirm').addEventListener('click', async () => {
  const fileId = +$('hyperlink-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;
  const url    = $('hyperlink-url').value.trim();
  const label  = $('hyperlink-label').value.trim() || url;
  if (!url) return alert('Please enter a URL.');

  const pageIdx = (+$('hyperlink-page').value || 1) - 1;
  const x = +$('hyperlink-x').value; const y = +$('hyperlink-y').value;
  const w = +$('hyperlink-w').value; const h = +$('hyperlink-h').value;
  closeModal('hyperlink-overlay');

  const buf  = await entry.file.arrayBuffer();
  const doc  = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  const page = doc.getPage(pageIdx);
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const fs   = Math.min(h * 0.75, 12);

  // Draw visible underlined blue text
  page.drawText(label, { x, y: y + 2, size: fs, font, color: PDFLib.rgb(0.1, 0.1, 0.8) });
  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.75, color: PDFLib.rgb(0.1, 0.1, 0.8) });

  // Add a URI annotation (clickable link)
  const pageRef = doc.getPage(pageIdx);
  const { PDFName, PDFDict, PDFArray, PDFRef, PDFString, PDFNumber } = PDFLib;
  const pdfDoc = doc;

  // Build annotation dictionary manually (pdf-lib doesn't expose link annotations via high-level API)
  const annot = pdfDoc.context.obj({
    Type:    PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect:    pdfDoc.context.obj([x, y, x + w, y + h]),
    Border:  pdfDoc.context.obj([0, 0, 0]),
    A: pdfDoc.context.obj({
      Type: PDFName.of('Action'),
      S:    PDFName.of('URI'),
      URI:  PDFString.of(url),
    }),
  });
  const annotRef = pdfDoc.context.register(annot);

  // Append to page's Annots array
  const rawPage = pageRef.node;
  const existing = rawPage.get(PDFName.of('Annots'));
  if (existing && existing.asArray) {
    existing.asArray().push(annotRef);
  } else {
    rawPage.set(PDFName.of('Annots'), pdfDoc.context.obj([annotRef]));
  }

  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, `linked_${entry.name}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// 📱 QR CODE — generate via canvas then embed as PNG
// ══════════════════════════════════════════════════════════════════════════════
function generateQRCanvas(text, size) {
  return new Promise((resolve, reject) => {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(container);
    try {
      new QRCode(container, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
      setTimeout(() => {
        const img = container.querySelector('img') || container.querySelector('canvas');
        if (!img) { document.body.removeChild(container); return reject(new Error('QR gen failed')); }
        // Draw to a canvas to get PNG bytes
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (img.tagName === 'CANVAS') {
          ctx.drawImage(img, 0, 0, size, size);
        } else {
          img.onload = () => { ctx.drawImage(img, 0, 0, size, size); document.body.removeChild(container); resolve(canvas); };
          img.src = img.src; // trigger load
          return;
        }
        document.body.removeChild(container);
        resolve(canvas);
      }, 150);
    } catch(e) { document.body.removeChild(container); reject(e); }
  });
}

$('qr-preview-btn').addEventListener('click', async () => {
  const text = $('qr-text').value.trim();
  if (!text) return alert('Enter URL or text first.');
  if (typeof QRCode === 'undefined') return alert('QR library not loaded. Check internet connection.');
  const size = +$('qr-size').value || 80;
  try {
    const canvas = await generateQRCanvas(text, size);
    const preview = $('qr-preview-canvas');
    preview.width  = size; preview.height = size;
    preview.getContext('2d').drawImage(canvas, 0, 0);
    $('qr-preview-wrap').style.display = 'block';
  } catch(e) { alert('QR generation failed: ' + e.message); }
});

$('qr-confirm').addEventListener('click', async () => {
  const fileId = +$('qr-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;
  const text   = $('qr-text').value.trim(); if (!text) return alert('Enter URL or text.');
  if (typeof QRCode === 'undefined') return alert('QR library not loaded. Check internet connection.');

  const total = typeof entry.pages === 'number' ? entry.pages : 1;
  const idx   = parseRanges($('qr-pages').value || 'all', total);
  const qrSz  = +$('qr-size').value || 80;
  const qrX   = +$('qr-x').value; const qrY = +$('qr-y').value;
  closeModal('qrcode-overlay');

  // Generate QR canvas
  let qrCanvas;
  try { qrCanvas = await generateQRCanvas(text, qrSz); }
  catch(e) { return alert('QR generation failed: ' + e.message); }

  // Export canvas to PNG bytes
  const dataUrl  = qrCanvas.toDataURL('image/png');
  const response = await fetch(dataUrl);
  const pngBytes = await response.arrayBuffer();

  const buf = await entry.file.arrayBuffer();
  const doc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
  const img = await doc.embedPng(pngBytes);

  idx.forEach(i => {
    const page = doc.getPage(i);
    page.drawImage(img, { x: qrX, y: qrY, width: qrSz, height: qrSz });
  });

  const blob = new Blob([await doc.save()], { type: 'application/pdf' });
  replaceFile(entry, blob, `qr_${entry.name}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// 📄 EXTRACT EMBEDDED IMAGES (via PDF.js operator parsing)
// ══════════════════════════════════════════════════════════════════════════════
$('extract-confirm').addEventListener('click', async () => {
  const fileId = +$('extract-target-file').value;
  const entry  = state.files.find(f => f.id === fileId); if (!entry) return;
  if (typeof pdfjsLib === 'undefined') return alert('PDF.js not loaded. Check internet connection.');

  const prog    = $('extract-progress');
  const results = $('extract-results');
  prog.style.display = 'block'; prog.textContent = 'Scanning PDF for images…';
  results.innerHTML = '';
  $('extract-confirm').disabled = true;

  try {
    const ab  = await entry.file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    const totalPages = pdf.numPages;
    let   count = 0;

    for (let p = 1; p <= totalPages; p++) {
      prog.textContent = `Scanning page ${p}/${totalPages}…`;
      const page     = await pdf.getPage(p);
      const ops      = await page.getOperatorList();
      const { fnArray, argsArray } = ops;
      const viewport = page.getViewport({ scale: 2 });

      // Find paintImageXObject operations
      for (let i = 0; i < fnArray.length; i++) {
        if (fnArray[i] === pdfjsLib.OPS.paintImageXObject || fnArray[i] === pdfjsLib.OPS.paintImageMaskXObject) {
          const imgName = argsArray[i][0];
          try {
            const objs  = page.commonObjs;
            const imgData = await new Promise((res, rej) => {
              page.objs.get(imgName, res);
              setTimeout(() => rej(new Error('timeout')), 2000);
            }).catch(() => null);

            if (!imgData || !imgData.data) continue;

            const canvas = document.createElement('canvas');
            canvas.width  = imgData.width;
            canvas.height = imgData.height;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(imgData.width, imgData.height);
            imageData.data.set(imgData.data);
            ctx.putImageData(imageData, 0, 0);

            count++;
            const filename = `image_p${p}_${count}.png`;
            // Show preview thumbnail
            const thumb = document.createElement('img');
            thumb.className = 'img-thumb';
            thumb.src    = canvas.toDataURL('image/png');
            thumb.title  = filename;
            results.appendChild(thumb);

            // Trigger download
            await new Promise(res => canvas.toBlob(blob => { triggerDownload(blob, filename); setTimeout(res, 200); }, 'image/png'));
          } catch {}
        }
      }
    }

    prog.textContent = count > 0
      ? `✅ Extracted ${count} image(s) successfully.`
      : '⚠️ No extractable images found in this PDF.';
  } catch(e) {
    prog.textContent = `Error: ${e.message}`;
    console.error(e);
  } finally {
    $('extract-confirm').disabled = false;
  }
});
