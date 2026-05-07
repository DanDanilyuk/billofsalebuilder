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
//
// Step layout (6 steps total):
//   1: Setup     - state (searchSelect) + role (radio)
//   2: You       - whichever party matches role
//   3: Other     - opposite party (with prominent skip-fill button)
//   4: Vehicle
//   5: Sale      - includes optional notary toggle (state-aware)
//   6: Review    - PDF preview + download

import { COPY } from './copy.js';
import { defaultState, loadState, saveState, clearState } from './storage.js';
import { fieldsForStep, youPrefix, otherPrefix } from './fields.js';
import { validators } from './validation.js';
import { buildBillOfSalePdf } from './pdf.js';
import { decodeVin } from './vin-decoder.js';
import { decodeZip } from './zip-decoder.js';
import { STATES, STATE_LIST, getState } from './states.js';

const TOTAL_STEPS = 6;

// Path changes that may add/remove conditional fields - require a re-render.
// meta.role swaps Step 2/3 binding (you vs other party).
// meta.usState toggles the notary checkbox visibility on Step 5 and rewrites
// the page header subtitle / footer disclaimer.
const RERENDER_PATHS = new Set([
  'meta.role',
  'meta.usState',
  'vehicle.type',
  'vehicle.subType',
  'sale.payment',
  'sale.priceNegotiable',
  'seller.skipFill',
  'buyer.skipFill',
  'seller.hasCoOwner',
  'buyer.hasCoOwner',
  'seller.coOwnerSameAddress',
  'buyer.coOwnerSameAddress',
]);

// Step number -> chrome key in COPY.wizard.steps. Drives applyDynamicChrome().
const STEP_KEY_BY_NUMBER = {
  1: 'setup',
  2: 'you',
  3: 'other',
  4: 'vehicle',
  5: 'sale',
  6: 'review',
};

const VIN_FORMAT = /^[A-HJ-NPR-Z0-9]{17}$/;
const VIN_DEBOUNCE_MS = 250;
const VIN_DECODED_REVERT_MS = 3000;

let state = loadState(defaultState());
let currentStep = 1;
let lastBlobUrl = null;
let vinDecodeToken = 0;     // increments per request; stale responses dropped
let vinDecodeTimer = null;  // debounce timer

// ---- init ----------------------------------------------------------------

function init() {
  bindActions();
  bindGlobalSearchSelectClose();
  bindThemeToggle();
  renderStep(currentStep);
}

// ---- theme toggle --------------------------------------------------------

function bindThemeToggle() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;

  const setLabel = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', `Switch to ${next} theme`);
  };
  setLabel();

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    setLabel();
  });

  // If the user hasn't picked manually, follow OS theme changes live.
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      let stored = null;
      try { stored = localStorage.getItem('theme'); } catch {}
      if (stored === 'light' || stored === 'dark') return;
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      setLabel();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}

// ---- step rendering ------------------------------------------------------

function renderStep(n) {
  document.querySelectorAll('.step').forEach((el) => {
    el.hidden = Number(el.dataset.step) !== n;
  });
  applyDynamicChrome(n);
  applyStateChrome();
  if (n === TOTAL_STEPS) {
    renderPreview();
  } else {
    renderForm(n);
  }
  updateActions(n);
  updateProgress();
}

function applyDynamicChrome(n) {
  const sec = document.querySelector(`.step[data-step="${n}"]`);
  if (!sec) return;
  const stepKey = STEP_KEY_BY_NUMBER[n];
  const stepCopy = COPY.wizard?.steps?.[stepKey];
  if (!stepCopy) return;

  let title = stepCopy.title || '';
  let sub = stepCopy.sub || '';
  if (stepCopy.titleTemplate) {
    const partyKey = (stepKey === 'you') ? youPrefix(state) : otherPrefix(state);
    const partyLabel = COPY.meta.role.options[partyKey] || '';
    title = stepCopy.titleTemplate.replace('{role}', partyLabel);
    // Surface the role-specific name hint at section level so it covers all
    // three name fields (and the co-owner) instead of just First name.
    const nameHint = COPY[partyKey]?.nameHint;
    if (nameHint) sub = sub ? `${sub} ${nameHint}` : nameHint;
  }

  setText(sec, '[data-step-eyebrow]', stepCopy.eyebrow || '');
  setText(sec, '[data-step-title]', title);
  setText(sec, '[data-step-sub]', sub);
}

function applyStateChrome() {
  const abbr = state.meta?.usState || '';
  const sub = document.querySelector('[data-state-subtitle]');
  const dis = document.querySelector('[data-page-disclaimer]');

  // No state picked yet: neutral chrome. Subtitle reads a placeholder so the
  // header keeps its height and the page doesn't reflow once a state is
  // committed. Footer falls back to a generic line.
  if (!abbr) {
    if (sub) sub.textContent = COPY.app.subtitleNoState;
    if (dis) dis.textContent = COPY.app.footerDisclaimerNoState;
    return;
  }

  const stateData = getState(abbr);
  const subtitle = stateData.honorific
    ? COPY.app.subtitleTemplate
        .replace('{honorific}', stateData.honorific)
        .replace('{name}', stateData.name)
    : COPY.app.subtitleNoHonorific.replace('{name}', stateData.name);
  if (sub) sub.textContent = subtitle;
  if (dis) {
    dis.textContent = COPY.app.footerDisclaimerTemplate.replace('{name}', stateData.name);
  }
}

function setText(scope, selector, value) {
  const el = scope.querySelector(selector);
  if (el) el.textContent = value;
}

function renderForm(n) {
  const form = document.querySelector(`[data-step-form="${n}"]`);
  if (!form) return;
  form.innerHTML = '';
  const fields = fieldsForStep(n, state);
  fields.forEach((f) => form.appendChild(renderField(f)));

  // Bind 'input' for typed fields (fires per-keystroke, keeps state fresh)
  // and 'change' for radio/checkbox/select (fires once on selection).
  // Text inputs ALSO listen for 'change' so blur-triggered effects (e.g.
  // ZIP -> city/state lookup) can run after the user is done typing.
  // Hidden inputs (used by searchSelect anchors) listen on 'input' too.
  form.querySelectorAll(
    'input[type="text"], input[type="number"], input[type="date"], input[type="hidden"]'
  ).forEach((el) => {
    el.addEventListener('input', onFieldChange);
    if (el.type !== 'hidden') el.addEventListener('change', onFieldChange);
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
    // Single inline-label checkbox (e.g. notary toggle).
    const group = document.createElement('div');
    group.className = 'checkbox-group';
    const lbl = document.createElement('label');
    let cls = 'checkbox' + (value ? ' is-selected' : '');
    if (field.emphasis === 'prominent') cls += ' checkbox--prominent';
    lbl.className = cls;
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
    } else if (field.kind === 'searchSelect') {
      wrap.appendChild(buildSearchSelect(field, value));
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
      else if (/\.street$/.test(field.path)) input.autocomplete = 'address-line1';
      else if (/\.street2$/.test(field.path)) input.autocomplete = 'address-line2';
      else if (/\.firstName$/.test(field.path)) input.autocomplete = 'given-name';
      else if (/\.middleName$/.test(field.path)) input.autocomplete = 'additional-name';
      else if (/\.lastName$/.test(field.path)) input.autocomplete = 'family-name';
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

// ---- searchSelect (filterable popover) ----------------------------------
//
// Renders a text input + ul popover. The hidden anchor input carries the
// committed value (state abbr) and a data-path so the existing onFieldChange
// flow picks it up: setByPath -> saveState -> RERENDER_PATHS -> renderForm.
//
// Currently only used for the meta.usState picker (optionsKey='states').

function buildSearchSelect(field, currentValue) {
  const optionsData = optionsForKey(field.optionsKey);
  const container = document.createElement('div');
  container.className = 'searchselect';

  const input = document.createElement('input');
  input.className = 'input searchselect__input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'Type a state name...';
  input.setAttribute('aria-autocomplete', 'list');

  const list = document.createElement('ul');
  list.className = 'searchselect__list';
  list.hidden = true;
  list.setAttribute('role', 'listbox');

  const optionEls = optionsData.map((s) => {
    const li = document.createElement('li');
    li.className = 'searchselect__option';
    li.setAttribute('role', 'option');
    li.dataset.value = s.abbr;
    const nameSpan = document.createElement('span');
    nameSpan.textContent = s.name;
    li.appendChild(nameSpan);
    const abbrSpan = document.createElement('span');
    abbrSpan.className = 'abbr';
    abbrSpan.textContent = s.abbr;
    li.appendChild(abbrSpan);
    return li;
  });
  optionEls.forEach((o) => list.appendChild(o));

  // Hidden anchor: the wizard's onFieldChange listens for this via data-path.
  const anchor = document.createElement('input');
  anchor.type = 'hidden';
  anchor.dataset.path = field.path;
  anchor.value = currentValue || '';
  anchor.className = 'searchselect__anchor';

  container.appendChild(input);
  container.appendChild(list);
  container.appendChild(anchor);

  // Show the current state's full name in the visible input.
  const initialMatch = optionsData.find((s) => s.abbr === currentValue);
  if (initialMatch) input.value = initialMatch.name;

  let highlighted = -1;

  function visibleOptions() {
    return optionEls.filter((o) => !o.hidden);
  }

  function setHighlight(idx) {
    optionEls.forEach((o) => o.setAttribute('aria-selected', 'false'));
    const visible = visibleOptions();
    if (visible.length === 0) { highlighted = -1; return; }
    highlighted = ((idx % visible.length) + visible.length) % visible.length;
    const target = visible[highlighted];
    target.setAttribute('aria-selected', 'true');
    target.scrollIntoView({ block: 'nearest' });
  }

  function openList() {
    list.hidden = false;
  }
  function closeList() {
    list.hidden = true;
    highlighted = -1;
    optionEls.forEach((o) => o.setAttribute('aria-selected', 'false'));
  }

  function filterOptions(query) {
    const q = String(query || '').trim().toLowerCase();
    optionEls.forEach((o) => {
      const s = optionsData.find((opt) => opt.abbr === o.dataset.value);
      const matches = !q
        || (s && s.name.toLowerCase().includes(q))
        || (s && s.abbr.toLowerCase().includes(q));
      o.hidden = !matches;
    });
    // Don't auto-highlight on filter change. Enter/Tab fall back to the first
    // visible match when nothing is highlighted (handled in keydown), so users
    // who type "California" + Enter commit California and ArrowDown moves the
    // highlight to index 0 (California) rather than skipping past it.
    optionEls.forEach((o) => o.setAttribute('aria-selected', 'false'));
    highlighted = -1;
  }

  function commit(abbr) {
    const obj = optionsData.find((s) => s.abbr === abbr);
    if (!obj) return;
    input.value = obj.name;
    anchor.value = abbr;
    closeList();
    // Drives onFieldChange (data-path on the hidden anchor).
    anchor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function revertInputToCurrent() {
    const obj = optionsData.find((s) => s.abbr === anchor.value);
    // When no state is committed yet, fall back to an empty input so the
    // placeholder shows again (instead of leaving stale typed text behind).
    input.value = obj ? obj.name : '';
  }

  input.addEventListener('focus', () => {
    filterOptions('');
    openList();
  });
  input.addEventListener('input', () => {
    filterOptions(input.value);
    openList();
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      filterOptions(input.value);
      openList();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(highlighted + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(highlighted - 1);
    } else if (e.key === 'Enter') {
      const visible = visibleOptions();
      if (visible.length === 0) return;
      e.preventDefault();
      // If the user has explicitly highlighted a row, commit that. Otherwise
      // commit the first visible match - so "California" + Enter commits
      // California rather than skipping over it.
      const target = (highlighted >= 0 && visible[highlighted]) ? visible[highlighted] : visible[0];
      commit(target.dataset.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeList();
      revertInputToCurrent();
      input.blur();
    } else if (e.key === 'Tab') {
      // On Tab, accept the highlighted option if any so a quick type-and-tab
      // workflow commits cleanly. With no highlight, fall back to the first
      // visible match when the user has typed something - that preserves the
      // "California" + Tab typeahead path. An empty input on Tab just reverts.
      const visible = visibleOptions();
      if (highlighted >= 0 && visible[highlighted]) {
        commit(visible[highlighted].dataset.value);
      } else if (visible.length > 0 && input.value.trim() !== '') {
        commit(visible[0].dataset.value);
      } else {
        revertInputToCurrent();
        closeList();
      }
    }
  });
  // Use mousedown so the click commits before the input's blur fires (which
  // would otherwise revert the value).
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('.searchselect__option');
    if (!li) return;
    e.preventDefault();
    commit(li.dataset.value);
  });

  return container;
}

function optionsForKey(key) {
  if (key === 'states') return STATE_LIST;
  return [];
}

// Single delegated listener: closes any open searchselect popover when the
// user clicks outside it. Registered once at init so we don't leak listeners
// across renderForm calls.
function bindGlobalSearchSelectClose() {
  document.addEventListener('mousedown', (e) => {
    document.querySelectorAll('.searchselect').forEach((ss) => {
      if (ss.contains(e.target)) return;
      const list = ss.querySelector('.searchselect__list');
      if (!list || list.hidden) return;
      list.hidden = true;
      list.querySelectorAll('.searchselect__option[aria-selected="true"]')
        .forEach((o) => o.setAttribute('aria-selected', 'false'));
      const input = ss.querySelector('.searchselect__input');
      const anchor = ss.querySelector('.searchselect__anchor');
      if (input && anchor) {
        const obj = STATES[anchor.value];
        input.value = obj ? obj.name : '';
      }
    });
  });
}

// ---- event handling ------------------------------------------------------

function onFieldChange(e) {
  const path = e.target.dataset.path;
  if (!path) return;
  const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  setByPath(state, path, value);

  // Side effects that have to land before saveState / re-render.
  if (path === 'sale.includeNotary') {
    state.sale.notaryUserSet = true;
  }
  if (path === 'meta.usState') {
    applyNotaryAutoDefault();
  }

  saveState(state);
  clearFieldError(e.target);

  if (path === 'vehicle.vin') triggerVinDecode();

  // ZIP -> city/state lookup. Fires only on blur (e.type==='change'), so it
  // doesn't hammer the API while the user is still typing. Fills city/state
  // ONLY when blank, so user-edited values are preserved.
  if (e.type === 'change' && /\.zip$/.test(path)) triggerZipLookup(path);

  if (RERENDER_PATHS.has(path)) {
    applyDynamicChrome(currentStep);
    applyStateChrome();
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

// When the user picks a US state, flip includeNotary on iff the state REQUIRES
// notarization AND the user hasn't explicitly toggled the checkbox themselves.
// 'recommended' / 'optional' leave the box unchecked (still visible, so the
// user can opt in). Once notaryUserSet is true, this auto-default is a no-op
// for the rest of the session.
function applyNotaryAutoDefault() {
  if (state.sale.notaryUserSet) return;
  const stateData = STATES[state.meta?.usState];
  if (!stateData) return;
  state.sale.includeNotary = stateData.notary === 'required';
}

// ---- ZIP -> city/state lookup -------------------------------------------

async function triggerZipLookup(path) {
  // path is one of: '<prefix>.zip' or '<prefix>.coOwner.zip'.
  // Derive the address root by trimming '.zip'.
  const root = path.slice(0, -'.zip'.length);
  const zip = String(getByPath(state, path) || '').trim();

  const decoded = await decodeZip(zip);
  if (!decoded) return;

  // Bail if the user kept editing - the field's value should still match the
  // ZIP we looked up. (Same idea as the VIN stale-response guard.)
  if (String(getByPath(state, path) || '').trim() !== zip) return;

  let touched = false;
  for (const [key, value] of [['city', decoded.city], ['state', decoded.state]]) {
    const fieldPath = `${root}.${key}`;
    const current = String(getByPath(state, fieldPath) || '').trim();
    if (current) continue; // respect user-typed values
    setByPath(state, fieldPath, value);
    touched = true;

    // Update the visible input in place (these paths aren't in
    // RERENDER_PATHS, so we don't need a full re-render).
    const input = document.querySelector(`[data-path="${fieldPath}"]`);
    if (input) {
      input.value = value;
      clearFieldError(input);
    }
  }
  if (touched) saveState(state);
}

// ---- VIN decoding --------------------------------------------------------

function triggerVinDecode() {
  clearTimeout(vinDecodeTimer);
  const vin = String(state.vehicle.vin || '').toUpperCase();
  const type = state.vehicle.type;
  if (type !== 'motor' && type !== 'trailer') return;
  if (!VIN_FORMAT.test(vin)) return;
  vinDecodeTimer = setTimeout(() => runVinDecode(vin, type), VIN_DEBOUNCE_MS);
}

async function runVinDecode(vin, type) {
  const myToken = ++vinDecodeToken;
  setVinHint(COPY.vehicle?.vin?.status?.decoding || '');

  let decoded = null;
  try {
    decoded = await decodeVin(vin, type);
  } catch {
    decoded = null;
  }

  // Drop stale responses if the user kept typing.
  if (myToken !== vinDecodeToken) return;
  if (String(state.vehicle.vin || '').toUpperCase() !== vin) return;

  if (!decoded) {
    // Clear the fields the decode would have controlled so the "fill manually"
    // hint isn't a lie. Don't touch vehicle.type - we don't know what to set
    // it to. Don't touch vin itself.
    for (const k of ['year', 'make', 'model', 'subType', 'subTypeOther']) {
      state.vehicle[k] = '';
    }
    saveState(state);
    renderForm(currentStep);
    setVinHint(COPY.vehicle?.vin?.status?.failed || '');
    refocusVin();
    return;
  }

  // Always overwrite decode-controlled fields. NHTSA's VehicleType (if
  // present) flips the form's type; year/make/model/body fall through to
  // empty when NHTSA didn't supply them so stale data from a previous VIN
  // doesn't stick.
  if (decoded.type != null) state.vehicle.type = decoded.type;
  for (const k of ['year', 'make', 'model', 'subType', 'subTypeOther']) {
    state.vehicle[k] = decoded[k] != null ? decoded[k] : '';
  }
  saveState(state);

  // Re-render so the (possibly new) vehicle.type's field set + conditional
  // fields (e.g. subTypeOther) appear/hide correctly. Restore focus to VIN.
  renderForm(currentStep);
  setVinHint(COPY.vehicle?.vin?.status?.decoded || '');

  refocusVin();

  setTimeout(() => {
    if (String(state.vehicle.vin || '').toUpperCase() !== vin) return;
    setVinHint(COPY.vehicle?.vin?.hint || '');
  }, VIN_DECODED_REVERT_MS);
}

function refocusVin() {
  const vinInput = document.querySelector('[data-path="vehicle.vin"]');
  if (!vinInput) return;
  vinInput.focus({ preventScroll: true });
  if (typeof vinInput.setSelectionRange === 'function') {
    const len = vinInput.value.length;
    vinInput.setSelectionRange(len, len);
  }
}

function setVinHint(text) {
  const vinInput = document.querySelector('[data-path="vehicle.vin"]');
  if (!vinInput) return;
  const wrap = vinInput.closest('.field');
  if (!wrap) return;
  let hint = wrap.querySelector('.field__hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'field__hint';
    const err = wrap.querySelector('.field__error');
    if (err) wrap.insertBefore(hint, err);
    else wrap.appendChild(hint);
  }
  hint.textContent = text;
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

// ---- modal ---------------------------------------------------------------
//
// In-page confirm dialog. Replaces the native window.confirm so the visual
// language matches the rest of the wizard. Returns a Promise<boolean>:
// resolves true when the user clicks the confirm button, false on cancel
// (Esc, click outside, click the cancel button).

function showModal(key) {
  return new Promise((resolve) => {
    const modalCopy = COPY.modals?.[key];
    const modal = document.querySelector('[data-modal]');
    if (!modal || !modalCopy) { resolve(false); return; }

    const setText = (sel, text) => {
      const el = modal.querySelector(sel);
      if (el) el.textContent = text;
    };
    setText('[data-modal-title]', modalCopy.title);
    setText('[data-modal-body]', modalCopy.body);
    setText('[data-modal-cancel]', modalCopy.cancel);
    setText('[data-modal-confirm]', modalCopy.confirm);

    const previouslyFocused = document.activeElement;
    const cleanup = (result) => {
      modal.hidden = true;
      modal.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
      resolve(result);
    };
    const onClick = (e) => {
      if (e.target.closest('[data-modal-confirm]')) cleanup(true);
      else if (e.target.closest('[data-modal-cancel]')) cleanup(false);
      else if (e.target.closest('[data-modal-overlay]')) cleanup(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
    };

    modal.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    modal.hidden = false;
    // Focus cancel by default - safer dismiss for an undo-less destructive action.
    setTimeout(() => modal.querySelector('[data-modal-cancel]')?.focus(), 0);
  });
}

// ---- actions -------------------------------------------------------------

function bindActions() {
  document.querySelector('[data-action="back"]').addEventListener('click', () => {
    goto(currentStep - 1);
  });
  document.querySelector('[data-action="continue"]').addEventListener('click', () => {
    if (validateStep(currentStep)) goto(currentStep + 1);
  });
  document.querySelector('[data-action="clear"]').addEventListener('click', async () => {
    const confirmed = await showModal('clearForm');
    if (confirmed) {
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
  const last = (state.seller?.lastName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const date = state.sale?.date || new Date().toISOString().slice(0, 10);
  const stateAbbr = String(state.meta?.usState || '').toLowerCase();
  const prefix = stateAbbr ? `${stateAbbr}-` : '';
  return `${prefix}bill-of-sale-${last || 'seller'}-${date}.pdf`;
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
