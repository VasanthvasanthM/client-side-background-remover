/**
 * Application bootstrap.
 *
 * Wires the controls to the editor and keeps the DOM in step with the store.
 * Deliberately the only file that knows about both: the engine knows nothing
 * about the DOM, and the editor knows nothing about which button is which.
 */

import { store } from './store.js';
import { initChrome } from './chrome.js';
import { t, applyTranslations, formatBytes, formatDimensions } from './i18n.js';
import { Editor, ACCEPTED_TYPES } from './editor.js';
import { parseHex, luminance } from './color.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/** Preset output backgrounds, in swatch order. */
const BACKGROUND_PRESETS = ['transparent', '#ffffff', '#000000', '#f3f4f6', '#0b1220', '#00b140', '#2563eb'];

const app = $('[data-app]');
if (app) boot(app);

function boot(root) {
  initChrome();

  const canvas = $('[data-canvas]', root);
  const viewport = $('[data-viewport]', root);
  const stage = canvas.closest('[data-drop]');
  const brushCursor = $('[data-brush-cursor]', root);
  const editor = new Editor({
    canvas,
    onState: () => renderState(),
    onProgress: (progress) => showProgress(progress),
  });

  /** null = fit to the viewport; a number = screen pixels per image pixel. */
  let zoom = null;

  /** The colour the eyedropper last picked, kept out of the store until used. */
  let pickedColor = '';
  /** 'none' | 'pick' | 'brush' */
  let pointerMode = 'none';
  let painting = false;
  let refreshHandle = 0;

  // -------------------------------------------------------------------------
  // Refresh scheduling
  // -------------------------------------------------------------------------

  /**
   * Coalesce rapid changes into one recompute per frame.
   *
   * A range input fires on every pixel of travel. Without this, dragging the
   * tolerance slider across its width queues a hundred full segmentations and
   * the preview trails the handle by seconds.
   */
  function scheduleRefresh() {
    if (refreshHandle) cancelAnimationFrame(refreshHandle);
    refreshHandle = requestAnimationFrame(() => {
      refreshHandle = 0;
      editor.refresh(pickedColor);
    });
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  const fileInput = $('[data-file]', root);
  const dropZone = $('[data-drop]', root);

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) accept(file);
    // Cleared so choosing the same file twice still fires a change event.
    fileInput.value = '';
  });

  async function accept(file) {
    const ok = await editor.load(file);
    if (ok) {
      pickedColor = '';
      // A new image always starts fitted. applyZoom has to run too: clearing
      // the variable alone would leave the previous image's pixel width on
      // the canvas and the stage still in zoom mode.
      zoom = null;
      applyZoom();
      scheduleRefresh();
    }
  }

  if (dropZone) {
    for (const type of ['dragenter', 'dragover']) {
      dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        dropZone.classList.add('is-dragging');
      });
    }
    for (const type of ['dragleave', 'drop']) {
      dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        dropZone.classList.remove('is-dragging');
      });
    }
    dropZone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) accept(file);
    });
  }

  // Paste is how people move a screenshot in, and it is the fastest path
  // there is — no file dialog, no temporary file on disk.
  document.addEventListener('paste', (event) => {
    const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (file) {
      event.preventDefault();
      accept(file);
    }
  });

  $('[data-clear]', root)?.addEventListener('click', () => {
    editor.unload();
    pickedColor = '';
    zoom = null;
    applyZoom();
  });

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------

  // Mode tabs
  for (const button of $$('[data-mode]', root)) {
    button.addEventListener('click', () => {
      const mode = button.dataset.mode;

      // AI mode costs a multi-megabyte download, so it is asked for once
      // and explicitly rather than triggered by a button press.
      if (mode === 'ai' && !store.get('aiAccepted')) {
        showConsent(true);
        return;
      }

      store.set({ mode });
      // Chroma keying without a key colour is meaningless; seed a sensible
      // green so the first result is the one the user expected.
      if (mode === 'chroma' && !pickedColor) pickedColor = '#00b140';
      if (mode === 'auto') pickedColor = '';
      renderState();
      scheduleRefresh();
    });
  }

  // Numeric and boolean fields, bound by name.
  for (const input of $$('[data-field]', root)) {
    const field = input.dataset.field;
    const event = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';

    input.addEventListener(event, () => {
      const value =
        input.type === 'checkbox'
          ? input.checked
          : input.type === 'range' || input.type === 'number'
            ? Number(input.value)
            : input.value;

      store.set({ [field]: value });
      renderState();
      // Brush and export settings change nothing about the current mask.
      if (!input.dataset.local) scheduleRefresh();
    });
  }

  // Background swatches
  const swatchRow = $('[data-swatches]', root);
  if (swatchRow) {
    for (const preset of BACKGROUND_PRESETS) {
      swatchRow.append(buildSwatch(preset));
    }
  }

  function buildSwatch(value) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.background = value;
    button.setAttribute('aria-label', value === 'transparent' ? t('out.transparent') : value);
    button.title = value === 'transparent' ? t('out.transparent') : value;

    if (value === 'transparent') {
      button.classList.add('swatch-transparent');
    } else {
      button.style.backgroundColor = value;
      const rgb = parseHex(value);
      if (rgb) button.classList.add(luminance(...rgb) > 0.5 ? 'swatch-light' : 'swatch-dark');
    }

    button.addEventListener('click', () => {
      store.set({ background: value });
      renderState();
      scheduleRefresh();
    });
    return button;
  }

  $('[data-custom-background]', root)?.addEventListener('input', (event) => {
    store.set({ background: event.target.value });
    renderState();
    scheduleRefresh();
  });

  // Pointer tools
  for (const button of $$('[data-tool]', root)) {
    button.addEventListener('click', () => {
      pointerMode = pointerMode === button.dataset.tool ? 'none' : button.dataset.tool;
      renderState();
    });
  }

  $('[data-undo-stroke]', root)?.addEventListener('click', () => {
    if (editor.undoStroke()) scheduleRefresh();
  });

  $('[data-clear-strokes]', root)?.addEventListener('click', () => {
    if (editor.clearStrokes()) scheduleRefresh();
  });

  $('[data-reset-settings]', root)?.addEventListener('click', () => {
    store.resetSettings();
    pickedColor = '';
    renderState();
    scheduleRefresh();
  });

  // -------------------------------------------------------------------------
  // Canvas interaction
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // AI mode: consent, progress and failure
  // -------------------------------------------------------------------------

  const consentPanel = $('[data-ai-consent]', root);
  const progressPanel = $('[data-ai-progress]', root);
  const progressBar = $('[data-ai-progress-bar]', root);
  const progressLabel = $('[data-ai-progress-label]', root);
  const aiNote = $('[data-ai-note]', root);

  function showConsent(visible) {
    if (consentPanel) consentPanel.hidden = !visible;
  }

  $('[data-ai-accept]', root)?.addEventListener('click', () => {
    store.set({ aiAccepted: true, mode: 'ai' });
    showConsent(false);
    renderState();
    scheduleRefresh();
  });

  $('[data-ai-cancel]', root)?.addEventListener('click', () => {
    showConsent(false);
  });

  /**
   * Report the model download.
   *
   * The first run fetches several megabytes before anything appears to
   * happen, and a silent multi-second wait is indistinguishable from a hang.
   */
  function showProgress(progress) {
    if (!progressPanel) return;

    if (progress?.cached || !progress || progress.loaded >= progress.total) {
      progressPanel.hidden = true;
      return;
    }

    const percent = Math.round((progress.loaded / progress.total) * 100);
    progressPanel.hidden = false;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressLabel) {
      progressLabel.textContent = t('ai.downloading', {
        percent: String(percent),
        size: formatBytes(progress.total),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Zoom
  // -------------------------------------------------------------------------

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 8;

  /**
   * The scale that "fit" currently resolves to.
   *
   * Measured from the rendered canvas rather than recomputed from the
   * viewport box, because the CSS constraints that produce the fit are the
   * source of truth and duplicating them here would drift from them.
   */
  function fittedScale() {
    if (!editor.hasImage || canvas.width === 0) return 1;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 ? rect.width / canvas.width : 1;
  }

  function currentScale() {
    return zoom ?? fittedScale();
  }

  /**
   * Change zoom, keeping a chosen point of the image where it already is.
   *
   * Without an anchor the scroll offsets stay put while the content grows, so
   * whatever you were looking at slides off screen — the image appears to leap
   * away on every click. Anchoring to the viewport centre, or to the pointer
   * for a wheel zoom, is what makes it feel attached.
   */
  function setZoom(next, anchor) {
    if (!editor.hasImage) return;

    const previous = currentScale();
    const clamped = next === null ? null : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));

    const focusX = anchor ? anchor.contentX : viewport.scrollLeft + viewport.clientWidth / 2;
    const focusY = anchor ? anchor.contentY : viewport.scrollTop + viewport.clientHeight / 2;
    const keepX = anchor ? anchor.viewX : viewport.clientWidth / 2;
    const keepY = anchor ? anchor.viewY : viewport.clientHeight / 2;

    zoom = clamped;
    applyZoom();

    if (zoom !== null && previous > 0) {
      const ratio = currentScale() / previous;
      viewport.scrollLeft = focusX * ratio - keepX;
      viewport.scrollTop = focusY * ratio - keepY;
    }
    renderState();
  }

  function applyZoom() {
    root.dataset.zoomMode = zoom === null ? 'fit' : 'zoom';
    canvas.style.width = zoom === null ? '' : Math.round(canvas.width * zoom) + 'px';
  }

  for (const button of $$('[data-zoom]', root)) {
    button.addEventListener('click', () => {
      const action = button.dataset.zoom;
      if (action === 'fit') setZoom(null);
      else if (action === 'actual') setZoom(1);
      else setZoom(currentScale() * (action === 'in' ? 1.25 : 1 / 1.25));
    });
  }

  // Ctrl/Cmd + wheel zooms about the pointer. A plain wheel is left alone so
  // it scrolls the viewport, like every other scrollable region on the page.
  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (!editor.hasImage) return;
      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const viewX = event.clientX - rect.left;
      const viewY = event.clientY - rect.top;

      setZoom(currentScale() * (event.deltaY < 0 ? 1.15 : 1 / 1.15), {
        contentX: viewport.scrollLeft + viewX,
        contentY: viewport.scrollTop + viewY,
        viewX,
        viewY,
      });
    },
    { passive: false },
  );

  // -------------------------------------------------------------------------
  // Drag to pan, only when no painting tool owns the pointer
  // -------------------------------------------------------------------------

  let panning = null;

  viewport.addEventListener('pointerdown', (event) => {
    if (zoom === null || pointerMode !== 'none' || !editor.hasImage) return;
    panning = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-panning');
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!panning || panning.id !== event.pointerId) return;
    viewport.scrollLeft = panning.left - (event.clientX - panning.x);
    viewport.scrollTop = panning.top - (event.clientY - panning.y);
  });

  for (const type of ['pointerup', 'pointercancel']) {
    viewport.addEventListener(type, (event) => {
      if (!panning || panning.id !== event.pointerId) return;
      viewport.releasePointerCapture?.(event.pointerId);
      viewport.classList.remove('is-panning');
      panning = null;
    });
  }

  // -------------------------------------------------------------------------
  // Brush size ring
  // -------------------------------------------------------------------------

  /**
   * Draw the brush at its true on-screen size under the pointer.
   *
   * The brush radius is in image pixels, so it has to be multiplied by the
   * current scale to be shown: at 25% zoom a 40px brush covers 10 screen
   * pixels, and a ring of the wrong size is worse than no ring.
   */
  function moveBrushCursor(event) {
    if (!brushCursor) return;

    if (pointerMode !== 'brush' || !editor.hasImage) {
      brushCursor.hidden = true;
      return;
    }

    const rect = stage.getBoundingClientRect();
    const diameter = Math.max(4, store.get('brushSize') * currentScale());

    brushCursor.hidden = false;
    brushCursor.dataset.erase = String(store.get('brushErase'));
    brushCursor.style.width = diameter + 'px';
    brushCursor.style.height = diameter + 'px';
    brushCursor.style.left = event.clientX - rect.left + 'px';
    brushCursor.style.top = event.clientY - rect.top + 'px';
  }

  canvas.addEventListener('pointermove', moveBrushCursor);
  canvas.addEventListener('pointerenter', moveBrushCursor);
  canvas.addEventListener('pointerleave', () => {
    if (brushCursor) brushCursor.hidden = true;
  });

  // -------------------------------------------------------------------------

  canvas.addEventListener('pointerdown', (event) => {
    if (!editor.hasImage) return;

    if (pointerMode === 'pick') {
      const hex = editor.pick(event.clientX, event.clientY);
      if (hex) {
        pickedColor = hex;
        store.rememberColor(hex);
        if (store.get('mode') === 'auto') store.set({ mode: 'color' });
        renderState();
        scheduleRefresh();
      }
      return;
    }

    if (pointerMode === 'brush') {
      painting = true;
      canvas.setPointerCapture(event.pointerId);
      if (editor.paint(event.clientX, event.clientY)) scheduleRefresh();
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!painting) return;
    if (editor.paint(event.clientX, event.clientY)) scheduleRefresh();
  });

  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, (event) => {
      if (!painting) return;
      painting = false;
      canvas.releasePointerCapture?.(event.pointerId);
    });
  }

  // Hold to compare against the original. Pointer and keyboard both, because
  // "hold a key" is unusable for anyone who cannot hold two at once.
  const compare = $('[data-compare]', root);
  if (compare) {
    const show = (on) => {
      store.set({ showOriginal: on });
      editor.draw();
      renderState();
    };
    compare.addEventListener('pointerdown', () => show(true));
    compare.addEventListener('pointerup', () => show(false));
    compare.addEventListener('pointerleave', () => show(false));
    compare.addEventListener('click', (event) => {
      // A click with no preceding pointerdown is a keyboard activation:
      // toggle instead of requiring a hold.
      if (event.detail === 0) show(!store.get('showOriginal'));
    });
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  const downloadButton = $('[data-download]', root);
  downloadButton?.addEventListener('click', async () => {
    if (!editor.hasImage) return;

    downloadButton.disabled = true;
    setStatus(t('out.working'));

    try {
      const result = await editor.exportBlob(pickedColor);
      if (!result?.blob) {
        setStatus(t('err.exportFailed'));
        return;
      }

      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = editor.suggestedName(result.type);
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
      // Revoked on the next tick: revoking synchronously races the download
      // in Safari and silently produces an empty file.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setStatus(
        t('out.saved', {
          size: formatBytes(result.blob.size),
          dimensions: formatDimensions(result.width, result.height),
        }),
      );
    } catch (error) {
      setStatus(error.message || t('err.exportFailed'));
    } finally {
      downloadButton.disabled = false;
    }
  });

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select')) return;
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'z' && editor.hasImage) {
        event.preventDefault();
        if (editor.undoStroke()) scheduleRefresh();
      }
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'b') setPointerMode('brush');
    else if (key === 'i') setPointerMode('pick');
    else if (key === 'escape') setPointerMode('none');
    else if (key === '0') setZoom(null);
    else if (key === '1') setZoom(1);
    else if (key === '+' || key === '=') setZoom(currentScale() * 1.25);
    else if (key === '-') setZoom(currentScale() / 1.25);
  });

  function setPointerMode(mode) {
    pointerMode = pointerMode === mode ? 'none' : mode;
    renderState();
  }

  // -------------------------------------------------------------------------
  // Rendering the UI from state
  // -------------------------------------------------------------------------

  const statusLine = $('[data-status]', root);
  function setStatus(message) {
    if (statusLine) statusLine.textContent = message;
  }

  function renderState() {
    const state = store.snapshot();

    root.dataset.hasImage = String(editor.hasImage);
    root.dataset.pointerMode = pointerMode;
    root.dataset.mode = state.mode;

    for (const button of $$('[data-mode]', root)) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
    }
    for (const button of $$('[data-tool]', root)) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === pointerMode));
    }
    for (const button of $$('[data-background]', root)) {
      button.setAttribute('aria-pressed', String(button.dataset.background === state.background));
    }

    for (const input of $$('[data-field]', root)) {
      const field = input.dataset.field;
      if (!(field in state)) continue;
      if (input.type === 'checkbox') input.checked = Boolean(state[field]);
      else if (document.activeElement !== input) input.value = String(state[field]);
    }

    for (const output of $$('[data-value-of]', root)) {
      const field = output.dataset.valueOf;
      if (field in state) output.textContent = String(state[field]);
    }

    const picked = $('[data-picked]', root);
    if (picked) {
      picked.textContent = pickedColor || t('pick.none');
      picked.style.setProperty('--picked', pickedColor || 'transparent');
    }

    const level = $('[data-zoom-level]', root);
    if (level) level.textContent = editor.hasImage ? Math.round(currentScale() * 100) + '%' : '';

    for (const button of $$('[data-zoom]', root)) {
      const action = button.dataset.zoom;
      if (action === 'fit') button.setAttribute('aria-pressed', String(zoom === null));
      else if (action === 'actual') button.setAttribute('aria-pressed', String(zoom === 1));
    }

    // The ring belongs to the brush tool alone; leaving it on screen after
    // switching tools would suggest the brush is still armed.
    if (brushCursor && pointerMode !== 'brush') brushCursor.hidden = true;

    if (aiNote) aiNote.hidden = state.mode !== 'ai';
    if (consentPanel && state.aiAccepted) consentPanel.hidden = true;

    renderInfo();
    renderWarning();
  }

  function renderInfo() {
    const info = $('[data-info]', root);
    if (!info) return;

    if (!editor.hasImage) {
      info.textContent = '';
      return;
    }
    info.textContent = t('info.image', {
      name: editor.fileName,
      dimensions: formatDimensions(editor.full.width, editor.full.height),
    });
  }

  function renderWarning() {
    const box = $('[data-warning]', root);
    if (!box) return;

    const warning = editor.error || (editor.hasImage ? editor.meta.warning : '');
    const key = editor.error ? '' : warning && `warn.${warning}`;

    box.textContent = editor.error || (key ? t(key) : '');
    box.hidden = !box.textContent;
  }

  // -------------------------------------------------------------------------

  const accepts = $('[data-accepts]', root);
  if (accepts) accepts.textContent = ACCEPTED_TYPES.map((type) => type.split('/')[1].toUpperCase()).join(', ');
  if (fileInput) fileInput.accept = ACCEPTED_TYPES.join(',');

  store.onPersistFailure = () => {
    const notice = $('[data-storage-state]', root);
    if (notice) notice.textContent = t('common.notSaved');
  };

  applyZoom();
  applyTranslations(root);
  renderState();
}
