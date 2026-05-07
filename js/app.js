// js/app.js
//
// Wizard state machine + DOM controller. Owns step navigation, field
// rendering, validation triggering, and PDF preview wiring.
//
// Field rendering contract (matches css/styles.css):
//   - Each rendered field is wrapped in <div class="field">.
//   - The active control carries data-path="<state.dot.path>".
//   - Inline errors live in <div class="field__error"> inside the wrapper.
//   - Adding `is-error` to the wrapper reveals the error text.
//   - VIN/HIN inputs use .input--mono.

import { COPY } from './copy.js';
import { defaultState, loadState, saveState, clearState } from './storage.js';
import { fieldsForStep } from './fields.js';
import { validators } from './validation.js';
import { buildBillOfSalePdf } from './pdf.js';

const TOTAL_STEPS = 5;
// Path changes that may add/remove conditional fields - require a re-render.
const RERENDER_PATHS = new Set([
  'vehicle.type',
  'vehicle.subType',
  'sale.payment',
]);

let state = loadState(defaultState());
let currentStep = 1;
let lastBlobUrl = null;

// ---- init ----------------------------------------------------------------

function init() {
  bindActions();
  renderStep(currentStep);
}

// ---- step rendering ------------------------------------------------------

function renderStep(n) {
  document.querySelectorAll('.step').forEach((el) => {
    el.hidden = Number(el.dataset.step) !== n;
  });
  if (n === TOTAL_STEPS) {
    renderPreview();
  } else {
    renderForm(n);
  }
  updateActions(n);
  updateProgress();
}

function renderForm(n) {
  const form = document.querySelector(`[data-step-form="${n}"]`);
  if (!form) return;
  form.innerHTML = '';
  const fields = fieldsForStep(n, state);
  fields.forEach((f) => form.appendChild(renderField(f)));

  // Bind 'input' for typed fields (fires per-keystroke, keeps state fresh)
  // and 'change' for radio/checkbox/select (fires once on selection).
  form.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]').forEach((el) => {
    el.addEventListener('input', onFieldChange);
  });
  form.querySelectorAll('input[type="radio"], input[type="checkbox"], select').forEach((el) => {
    el.addEventListener('change', onFieldChange);
  });
}

function renderField(field) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const value = getByPath(state, field.path);

  if (field.kind === 'checkbox') {
    // Single inline-label checkbox (e.g. as-is acknowledgment).
    const group = document.createElement('div');
    group.className = 'checkbox-group';
    const lbl = document.createElement('label');
    lbl.className = 'checkbox' + (value ? ' is-selected' : '');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.path = field.path;
    input.checked = !!value;
    const span = document.createElement('span');
    span.textContent = field.label;
    lbl.appendChild(input);
    lbl.appendChild(span);
    group.appendChild(lbl);
    wrap.appendChild(group);
  } else {
    // Field label (above the control).
    const labelEl = document.createElement('label');
    labelEl.className = 'field__label';
    labelEl.textContent = field.label;
    if (field.req) {
      const req = document.createElement('span');
      req.className = 'req';
      req.textContent = '*';
      labelEl.appendChild(req);
    }
    wrap.appendChild(labelEl);

    if (field.kind === 'radio') {
      const group = document.createElement('div');
      group.className = 'radio-group';
      Object.entries(field.options || {}).forEach(([k, v]) => {
        const lbl = document.createElement('label');
        lbl.className = 'radio' + (value === k ? ' is-selected' : '');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = field.path;
        input.value = k;
        input.dataset.path = field.path;
        if (value === k) input.checked = true;
        const span = document.createElement('span');
        span.textContent = v;
        lbl.appendChild(input);
        lbl.appendChild(span);
        group.appendChild(lbl);
      });
      wrap.appendChild(group);
    } else if (field.kind === 'select') {
      const sel = document.createElement('select');
      sel.className = 'select';
      sel.dataset.path = field.path;
      // Hidden placeholder for the empty state.
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose...';
      placeholder.disabled = true;
      placeholder.selected = !value;
      sel.appendChild(placeholder);
      Object.entries(field.options || {}).forEach(([k, v]) => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = v;
        if (value === k) opt.selected = true;
        sel.appendChild(opt);
      });
      wrap.appendChild(sel);
    } else {
      // text, number, date
      const input = document.createElement('input');
      input.className = 'input' + (field.mono ? ' input--mono' : '');
      input.dataset.path = field.path;
      input.value = value ?? '';
      if (field.kind === 'date') {
        input.type = 'date';
      } else if (field.kind === 'number') {
        input.type = 'number';
        input.inputMode = 'decimal';
      } else {
        input.type = 'text';
      }
      // Sensible autocomplete hints.
      if (/\.zip$/.test(field.path)) input.autocomplete = 'postal-code';
      else if (/\.city$/.test(field.path)) input.autocomplete = 'address-level2';
      else if (/\.state$/.test(field.path)) input.autocomplete = 'address-level1';
      else if (/\.street$/.test(field.path)) input.autocomplete = 'street-address';
      else if (/\.name$/.test(field.path)) input.autocomplete = 'name';
      else if (/\.phone$/.test(field.path)) input.autocomplete = 'tel';
      wrap.appendChild(input);
    }
  }

  if (field.hint) {
    const hint = document.createElement('div');
    hint.className = 'field__hint';
    hint.textContent = field.hint;
    wrap.appendChild(hint);
  }
  const err = document.createElement('div');
  err.className = 'field__error';
  wrap.appendChild(err);

  return wrap;
}

// ---- event handling ------------------------------------------------------

function onFieldChange(e) {
  const path = e.target.dataset.path;
  if (!path) return;
  const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  setByPath(state, path, value);
  saveState(state);
  clearFieldError(e.target);

  if (RERENDER_PATHS.has(path)) {
    renderForm(currentStep);
    return;
  }

  // Update is-selected styling for radios/checkboxes without a full re-render
  // so we don't drop focus.
  if (e.target.type === 'radio') {
    const group = e.target.closest('.radio-group');
    if (group) {
      group.querySelectorAll('.radio').forEach((r) => {
        const input = r.querySelector('input[type="radio"]');
        r.classList.toggle('is-selected', !!(input && input.checked));
      });
    }
  } else if (e.target.type === 'checkbox') {
    const lbl = e.target.closest('.checkbox');
    if (lbl) lbl.classList.toggle('is-selected', e.target.checked);
  }
}

function validateStep(n) {
  const fields = fieldsForStep(n, state);
  let firstInvalid = null;
  let allValid = true;
  fields.forEach((f) => {
    const value = getByPath(state, f.path);
    const code = runValidators(f, value);
    if (code) {
      allValid = false;
      showFieldError(f.path, code);
      if (!firstInvalid) firstInvalid = f.path;
    }
  });
  if (firstInvalid) {
    const el = document.querySelector(`[data-path="${firstInvalid}"]`);
    if (el && typeof el.focus === 'function') {
      el.focus({ preventScroll: false });
    }
  }
  return allValid;
}

// ---- actions -------------------------------------------------------------

function bindActions() {
  document.querySelector('[data-action="back"]').addEventListener('click', () => {
    goto(currentStep - 1);
  });
  document.querySelector('[data-action="continue"]').addEventListener('click', () => {
    if (validateStep(currentStep)) goto(currentStep + 1);
  });
  document.querySelector('[data-action="clear"]').addEventListener('click', () => {
    if (confirm('Clear the form? This cannot be undone.')) {
      clearState();
      state = defaultState();
      currentStep = 1;
      renderStep(1);
    }
  });
  // Download anchor: href + download attribute set in renderPreview.
  // Native click triggers the file save - we don't preventDefault.
  document.querySelector('[data-action="download"]').addEventListener('click', () => {
    /* no-op; <a download> handles the save */
  });
}

function goto(n) {
  if (n < 1 || n > TOTAL_STEPS) return;
  currentStep = n;
  renderStep(n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateActions(n) {
  const back = document.querySelector('[data-action="back"]');
  const cont = document.querySelector('[data-action="continue"]');
  const clear = document.querySelector('[data-action="clear"]');
  const dl = document.querySelector('[data-action="download"]');

  back.hidden = n === 1;
  back.textContent = n === TOTAL_STEPS ? COPY.actions.backToEdit : COPY.actions.back;

  clear.hidden = n !== 1;
  clear.textContent = COPY.actions.clear;

  if (n === TOTAL_STEPS) {
    cont.hidden = true;
    dl.hidden = false;
    dl.textContent = COPY.actions.download;
  } else {
    cont.hidden = false;
    dl.hidden = true;
    cont.textContent = n === TOTAL_STEPS - 1 ? 'Review' : COPY.actions.continue;
  }
}

function updateProgress() {
  document.querySelectorAll('.progress__seg').forEach((seg) => {
    const n = Number(seg.dataset.step);
    seg.classList.toggle('is-done', n < currentStep);
    seg.classList.toggle('is-current', n === currentStep);
  });
}

// ---- preview / download --------------------------------------------------

function renderPreview() {
  try {
    const blob = buildBillOfSalePdf(state);
    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = URL.createObjectURL(blob);

    const iframe = document.querySelector('.pdf-preview');
    if (iframe) iframe.src = lastBlobUrl;

    const dl = document.querySelector('[data-action="download"]');
    if (dl) {
      dl.href = lastBlobUrl;
      dl.download = downloadFilename();
    }
  } catch (err) {
    console.error('PDF preview build failed:', err);
  }
}

function downloadFilename() {
  // Strip common name suffixes (Jr., Sr., II-V, with optional trailing comma)
  // before grabbing the last token. Otherwise "Bart Christopherson III" would
  // produce ".../iii-..." instead of ".../christopherson-...".
  const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
  const raw = (state.seller?.name || '').trim();
  const tokens = raw
    .split(/\s+/)
    .filter((t) => t && !SUFFIX.test(t.replace(/,$/, '')));
  const last = (tokens.pop() || 'seller').toLowerCase().replace(/[^a-z0-9]/g, '');
  const date = state.sale?.date || new Date().toISOString().slice(0, 10);
  return `va-bill-of-sale-${last || 'seller'}-${date}.pdf`;
}

// ---- helpers -------------------------------------------------------------

function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setByPath(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  const target = parts.reduce((o, k) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    return o[k];
  }, obj);
  target[last] = value;
}

function runValidators(field, value) {
  if (field.req && validators.required(value)) return 'required';
  if (!field.validate) return null;
  for (const name of field.validate) {
    const fn = validators[name];
    if (typeof fn !== 'function') continue;
    const code = fn(value);
    if (code) return code;
  }
  return null;
}

function showFieldError(path, code) {
  const el = document.querySelector(`[data-path="${path}"]`);
  if (!el) return;
  const wrap = el.closest('.field');
  if (!wrap) return;
  wrap.classList.add('is-error');
  const errEl = wrap.querySelector('.field__error');
  if (errEl) errEl.textContent = COPY.errors[code] || COPY.errors.required;
}

function clearFieldError(el) {
  const wrap = el.closest('.field');
  if (!wrap) return;
  wrap.classList.remove('is-error');
  const errEl = wrap.querySelector('.field__error');
  if (errEl) errEl.textContent = '';
}

// ---- go ------------------------------------------------------------------

init();
