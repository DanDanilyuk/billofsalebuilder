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
import { defaultState, loadState, saveState, clearState, localDateString } from './storage.js';
import { fieldsForStep, youPrefix, otherPrefix } from './fields.js';
import { validators, formatPhone } from './validation.js';
import { buildBillOfSalePdf } from './pdf.js';
import { decodeVin } from './vin-decoder.js';
import { decodeZip } from './zip-decoder.js';
import { STATES, STATE_LIST, getState } from './states.js';
import { bindThemeToggle } from './theme.js';

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
let previewBuildFailed = false; // last renderPreview() threw; hides download/iframe
let previewReady = false;       // a preview build SUCCEEDED; gates download/open/print
let vinDecodeToken = 0;     // increments per request; stale responses dropped
let vinDecodeTimer = null;  // debounce timer
let uidCounter = 0;         // monotonic; keeps rendered field ids unique across re-renders

// Builds a DOM id unique to this render pass so label[for] can point at its
// control. renderForm re-runs often, so we mix the (sanitized) field path with
// a monotonic counter to stay unique even when the same path is re-rendered.
function fieldUid(path) {
  const safe = String(path || 'field').replace(/[^a-zA-Z0-9]+/g, '-');
  return `field-${safe}-${++uidCounter}`;
}

// ---- init ----------------------------------------------------------------

function init() {
  bindActions();
  bindGlobalSearchSelectClose();
  bindThemeToggle();
  renderStep(currentStep);
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

  // Step 1 guidance card. Called before the no-state early return below so it
  // both populates (state set) and clears/hides (no state) on every pass.
  renderStateGuidance();

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

// Populates the Step 1 state-guidance card from the selected state's STATES
// entry + COPY.stateGuidance. Built with textContent on real child nodes (never
// innerHTML) since states.js prose flows in unescaped. Hidden + emptied when no
// state is picked. Lines render conditionally: filing deadline only for a numeric
// filingDeadlineDays, notes only when present, notary keyed by the state's rule.
function renderStateGuidance() {
  const box = document.querySelector('[data-state-guidance]');
  if (!box) return;
  const abbr = state.meta?.usState || '';

  // No state yet: clear and hide so Step 1 collapses back to just the form.
  if (!abbr) {
    box.replaceChildren();
    box.hidden = true;
    return;
  }

  const stateData = getState(abbr);
  const copy = COPY.stateGuidance;
  const name = stateData.name;
  // Interpolate the per-state name (and filing-deadline day count) into a template.
  const fill = (tpl) => String(tpl || '')
    .replace(/\{name\}/g, name)
    .replace(/\{days\}/g, String(stateData.filingDeadlineDays));

  const frag = document.createDocumentFragment();

  const heading = document.createElement('h3');
  heading.className = 'state-guidance__heading';
  heading.textContent = fill(copy.headingTemplate);
  frag.appendChild(heading);

  // Append a muted body line; skips empty text. extraClass distinguishes the
  // de-emphasized disclaimer line.
  const addLine = (text, extraClass) => {
    if (!text) return;
    const p = document.createElement('p');
    p.className = 'state-guidance__line' + (extraClass ? ' ' + extraClass : '');
    p.textContent = text;
    frag.appendChild(p);
  };

  // Filing deadline - only when the state defines a numeric deadline.
  if (typeof stateData.filingDeadlineDays === 'number') {
    addLine(fill(copy.filingDeadlineTemplate));
  }
  // Notary - variant keyed by the state's requirement; skip if the key is unknown.
  const notaryTpl = copy.notary && copy.notary[stateData.notary];
  if (notaryTpl) addLine(fill(notaryTpl));
  // State-specific notes - already prose in states.js, shown verbatim.
  if (stateData.notes) addLine(stateData.notes);
  // Disclaimer - always shown, de-emphasized.
  addLine(fill(copy.disclaimerTemplate), 'state-guidance__disclaimer');

  box.replaceChildren(frag);
  box.hidden = false;
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
      // Associate the label with this control so clicking it focuses the select.
      const id = fieldUid(field.path);
      sel.id = id;
      labelEl.htmlFor = id;
      // Hidden placeholder for the empty state.
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = COPY.app.selectPlaceholder;
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
      // Point the label at the VISIBLE text input (not the hidden anchor), so
      // clicking the label focuses the field the user actually types into.
      const id = fieldUid(field.path);
      labelEl.htmlFor = id;
      wrap.appendChild(buildSearchSelect(field, value, id));
    } else {
      // text, number, date
      const input = document.createElement('input');
      input.className = 'input' + (field.mono ? ' input--mono' : '');
      input.dataset.path = field.path;
      // Associate the label with this control so clicking it focuses the input.
      const id = fieldUid(field.path);
      input.id = id;
      labelEl.htmlFor = id;
      input.value = value ?? '';
      if (field.kind === 'date') {
        input.type = 'date';
      } else if (field.kind === 'number') {
        input.type = 'number';
        // Optional per-field hints drive inputMode + native min/step without
        // hardcoding field paths here (e.g. year uses 'numeric', odometer
        // clamps step to whole numbers). Defaults preserve prior behavior.
        input.inputMode = field.inputMode || 'decimal';
        if (field.min != null) input.min = String(field.min);
        if (field.step != null) input.step = String(field.step);
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

function buildSearchSelect(field, currentValue, controlId) {
  const optionsData = optionsForKey(field.optionsKey);
  const container = document.createElement('div');
  container.className = 'searchselect';

  // Stable ids tie the combobox input to its listbox (aria-controls) and to the
  // active option (aria-activedescendant). Derive from controlId so they stay
  // unique across re-renders; fall back to a fresh fieldUid if it's absent.
  const listId = (controlId || fieldUid(field.path)) + '-list';

  const input = document.createElement('input');
  input.className = 'input searchselect__input';
  // The label[for] from renderField targets this visible input.
  if (controlId) input.id = controlId;
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = field.placeholder || '';
  // Combobox pattern: announce the popover state and active option to SRs.
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-expanded', 'false');

  const list = document.createElement('ul');
  list.className = 'searchselect__list';
  list.id = listId;
  list.hidden = true;
  list.setAttribute('role', 'listbox');

  const optionEls = optionsData.map((s) => {
    const li = document.createElement('li');
    li.className = 'searchselect__option';
    // Per-option id so aria-activedescendant can reference the highlighted row.
    li.id = listId + '-opt-' + s.abbr;
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
    if (visible.length === 0) {
      highlighted = -1;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    highlighted = ((idx % visible.length) + visible.length) % visible.length;
    const target = visible[highlighted];
    target.setAttribute('aria-selected', 'true');
    target.scrollIntoView({ block: 'nearest' });
    // Point the combobox at the highlighted row so SRs announce it.
    input.setAttribute('aria-activedescendant', target.id);
  }

  function openList() {
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function closeList() {
    list.hidden = true;
    highlighted = -1;
    optionEls.forEach((o) => o.setAttribute('aria-selected', 'false'));
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
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
    input.removeAttribute('aria-activedescendant');
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
      // Mirror closeList() so the combobox state stays consistent on outside-click.
      if (input) {
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
      }
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
  // Role swap: the party that just became "you" must not stay skip-filled.
  // Step 2 omits the skip checkbox entirely, so a stale skipFill=true would
  // render the step with zero fields (and print the user's own PDF section
  // as blank lines) with no UI to undo it.
  if (path === 'meta.role') {
    state[youPrefix(state)].skipFill = false;
  }

  saveState(state);
  clearFieldError(e.target);

  if (path === 'vehicle.vin') triggerVinDecode();

  // ZIP -> city/state lookup. Fires only on blur (e.type==='change'), so it
  // doesn't hammer the API while the user is still typing. Fills city/state
  // ONLY when blank, so user-edited values are preserved.
  if (e.type === 'change' && /\.zip$/.test(path)) triggerZipLookup(path);

  // Phone -> (xxx) xxx-xxxx. Fires only on blur (e.type==='change'), and only
  // when formatPhone returns the complete formatted form, so partial input
  // mid-typo is left alone for the validator to flag.
  if (e.type === 'change' && /\.phone$/.test(path)) {
    const formatted = formatPhone(value);
    if (formatted !== value && /^\(\d{3}\) \d{3}-\d{4}$/.test(formatted)) {
      setByPath(state, path, formatted);
      e.target.value = formatted;
      saveState(state);
    }
  }

  if (RERENDER_PATHS.has(path)) {
    const focusSnap = captureFocus();
    applyDynamicChrome(currentStep);
    applyStateChrome();
    renderForm(currentStep);
    restoreFocus(focusSnap);
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

// ---- focus preservation across re-renders ---------------------------------
//
// renderForm wipes the step's DOM, so any RERENDER_PATHS change would dump
// keyboard focus to <body> (worst for radios, which fire change on every
// arrow-key press). Snapshot the focused control before the re-render and
// restore it - including text selection and, for radios, the specific option.

function captureFocus() {
  const el = document.activeElement;
  if (!el) return null;
  let path = el.dataset ? el.dataset.path : null;
  // searchSelect: focus lives on the visible input; the [data-path] sits on
  // the hidden anchor next to it.
  const isSearchSelect = !path && !!el.closest?.('.searchselect');
  if (isSearchSelect) {
    path = el.closest('.searchselect').querySelector('.searchselect__anchor')?.dataset.path;
  }
  if (!path) return null;
  const snap = { path, isSearchSelect };
  if (el.type === 'radio') snap.radioValue = el.value;
  if (typeof el.selectionStart === 'number') {
    snap.selStart = el.selectionStart;
    snap.selEnd = el.selectionEnd;
  }
  return snap;
}

function restoreFocus(snap) {
  if (!snap) return;
  let el = snap.radioValue != null
    ? document.querySelector(`[data-path="${snap.path}"][value="${snap.radioValue}"]`)
    : document.querySelector(`[data-path="${snap.path}"]`);
  if (!el) return; // the focused field no longer exists in the new field set
  if (el.type === 'hidden') {
    el = el.closest('.searchselect')?.querySelector('.searchselect__input');
    if (!el) return;
  }
  el.focus({ preventScroll: true });
  // Refocusing a searchSelect input fires its focus listener, which opens the
  // popover - unwanted right after a commit. Close it again (mirrors the
  // outside-click close in bindGlobalSearchSelectClose).
  if (snap.isSearchSelect) {
    const list = el.closest('.searchselect')?.querySelector('.searchselect__list');
    if (list) list.hidden = true;
    el.setAttribute('aria-expanded', 'false');
    el.removeAttribute('aria-activedescendant');
  }
  if (snap.selStart != null && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(snap.selStart, snap.selEnd); } catch { /* non-text input */ }
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
      if (e.key === 'Escape') { cleanup(false); return; }
      if (e.key !== 'Tab') return;
      // Trap focus inside the dialog while it's open so Tab / Shift+Tab can't
      // wander into the form behind it. Collect the dialog's focusable controls
      // (skipping disabled / hidden ones), then wrap focus at the boundaries.
      const dialog = modal.querySelector('.modal__dialog');
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        // Shift+Tab off the first control (or focus that escaped the dialog) wraps to the last.
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        // Tab off the last control wraps back to the first.
        e.preventDefault();
        first.focus();
      }
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
  // Print the generated PDF preview. Printing the blob-PDF iframe is the
  // standard desktop path; if the iframe document can't be reached (e.g. some
  // mobile browsers), fall back to printing the page. Mobile users are better
  // served by Open PDF in a new tab, then printing from there.
  document.querySelector('[data-action="print"]').addEventListener('click', () => {
    const f = document.querySelector('.pdf-preview');
    if (f && f.contentWindow) {
      try { f.contentWindow.focus(); f.contentWindow.print(); }
      catch { window.print(); }
    } else {
      window.print();
    }
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
  const openPdf = document.querySelector('[data-action="open-pdf"]');
  const printBtn = document.querySelector('[data-action="print"]');

  back.hidden = n === 1;
  back.textContent = n === TOTAL_STEPS ? COPY.actions.backToEdit : COPY.actions.back;

  clear.hidden = n !== 1;
  clear.textContent = COPY.actions.clear;

  if (n === TOTAL_STEPS) {
    cont.hidden = true;
    // Gate the PDF actions on a SUCCEEDED build: renderPreview() is async (lazy
    // jsPDF), so this sync call can run before the blob exists. previewReady is
    // reset to false at the start of renderPreview() and set true only on
    // success, so the buttons stay hidden until there's a real PDF to act on.
    // "Back to edit" stays visible regardless so the user can always leave.
    const ready = previewReady && !previewBuildFailed;
    dl.hidden = !ready;
    dl.textContent = COPY.actions.download;
    if (openPdf) {
      openPdf.hidden = !ready;
      openPdf.textContent = COPY.actions.openPdf;
    }
    if (printBtn) {
      printBtn.hidden = !ready;
      printBtn.textContent = COPY.actions.print;
    }
  } else {
    cont.hidden = false;
    dl.hidden = true;
    if (openPdf) openPdf.hidden = true;
    if (printBtn) printBtn.hidden = true;
    cont.textContent = n === TOTAL_STEPS - 1 ? COPY.actions.review : COPY.actions.continue;
  }
}

function updateProgress() {
  document.querySelectorAll('.progress__seg').forEach((seg) => {
    const n = Number(seg.dataset.step);
    seg.classList.toggle('is-done', n < currentStep);
    seg.classList.toggle('is-current', n === currentStep);
    // Expose the active step to assistive tech (color alone isn't perceivable).
    if (n === currentStep) seg.setAttribute('aria-current', 'step');
    else seg.removeAttribute('aria-current');
  });
  // Dynamic, descriptive label so SRs announce "Step N of 6" as the user moves.
  const prog = document.querySelector('.progress');
  if (prog) {
    prog.setAttribute(
      'aria-label',
      COPY.app.progressLabel.replace('{n}', currentStep).replace('{total}', TOTAL_STEPS)
    );
  }
}

// ---- preview / download --------------------------------------------------

// One-shot lazy loader for the vendored jsPDF UMD bundle. It's only needed at
// Step 6, so we inject the <script> on first need instead of blocking first
// paint on every page view. Resolves immediately if jsPDF is already present;
// on load failure the promise is cleared so a later attempt can retry.
let jsPdfPromise = null;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve();
  if (!jsPdfPromise) {
    jsPdfPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'lib/jspdf.umd.min.js';
      s.onload = resolve;
      s.onerror = () => { jsPdfPromise = null; reject(new Error('jsPDF failed to load')); };
      document.head.appendChild(s);
    });
  }
  return jsPdfPromise;
}

// Lazily creates (once) and returns the Step 6 build-error banner. index.html
// is owned elsewhere, so the element is managed here: a role="alert" div appended
// to the Step 6 section (the iframe's parent) so screen readers announce it when
// it appears. Returns null if the section isn't in the DOM.
function getPreviewErrorEl() {
  let el = document.querySelector('.preview-error');
  if (el) return el;
  const section = document.querySelector('.step[data-step="6"]');
  if (!section) return null;
  el = document.createElement('div');
  el.className = 'preview-error';
  el.setAttribute('role', 'alert');
  el.hidden = true;
  section.appendChild(el);
  return el;
}

async function renderPreview() {
  const iframe = document.querySelector('.pdf-preview');
  const errEl = getPreviewErrorEl();
  const hintEl = document.querySelector('[data-pdf-hint]');
  const openEl = document.querySelector('[data-action="open-pdf"]');
  // Synchronous reset: runs before renderStep()'s updateActions(6), so the
  // download/open/print buttons start hidden and only reveal once the async
  // build below succeeds (no transient stale/missing-href window).
  previewReady = false;
  try {
    // Lazy-load jsPDF on first preview. A load failure rejects here and falls
    // into the same catch as a build error, so the user sees the error banner.
    await loadJsPdf();
    const blob = buildBillOfSalePdf(state);
    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = URL.createObjectURL(blob);

    if (iframe) {
      iframe.src = lastBlobUrl;
      iframe.hidden = false;
    }

    const dl = document.querySelector('[data-action="download"]');
    if (dl) {
      dl.href = lastBlobUrl;
      dl.download = downloadFilename();
    }

    // Mobile-safe escape hatches: the inline iframe is unreliable on some
    // browsers (iOS Safari), so always offer open-in-new-tab + an explanatory
    // hint. Button visibility is restored by updateActions() via the flag.
    if (openEl) openEl.href = lastBlobUrl;
    if (hintEl) {
      hintEl.textContent = COPY.review.previewHint;
      hintEl.hidden = false;
    }

    // Success: clear any prior error so a retry after fixing data shows the
    // preview rather than a stale message. updateActions() reads the flag to
    // restore the download button.
    previewBuildFailed = false;
    previewReady = true;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    // renderPreview() is async now, so renderStep()'s updateActions() already
    // ran against a stale flag. Re-sync the action buttons to the real outcome,
    // but only if the user is still on Step 6 (a late resolve must not mutate
    // the UI after they navigated away).
    if (currentStep === TOTAL_STEPS) updateActions(TOTAL_STEPS);
  } catch (err) {
    console.error('PDF preview build failed:', err);
    // Surface a visible, accessible message and hide the blank iframe. The
    // download + open-pdf buttons are hidden by updateActions() via the flag.
    previewBuildFailed = true;
    if (iframe) iframe.hidden = true;
    if (errEl) {
      errEl.textContent = COPY.review.buildError;
      errEl.hidden = false;
    }
    // No document to open or describe - drop the new-tab href and hide the hint.
    if (openEl) openEl.removeAttribute('href');
    if (hintEl) hintEl.hidden = true;
    // Re-sync actions to the failed outcome (see success branch); guard against
    // a late resolve after the user left Step 6.
    if (currentStep === TOTAL_STEPS) updateActions(TOTAL_STEPS);
  }
}

function downloadFilename() {
  // Name the file after the "you" party (the one the user fills in), so a buyer
  // with a skip-filled seller doesn't get a "...-seller" / "...-undefined" name.
  const youP = youPrefix(state);
  const last = (state[youP]?.lastName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const date = state.sale?.date || localDateString();
  const stateAbbr = String(state.meta?.usState || '').toLowerCase();
  const prefix = stateAbbr ? `${stateAbbr}-` : '';
  // Fallback to the role label ('seller' / 'buyer') when no last name is given.
  return `${prefix}bill-of-sale-${last || youP}-${date}.pdf`;
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
  // Optional fields: blank means "no answer", so format validators don't run
  // (otherwise e.g. the optional co-owner ZIP would block Continue when empty).
  if (!field.req && String(value ?? '').trim() === '') return null;
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
  if (errEl) {
    errEl.textContent = COPY.errors[code] || COPY.errors.required;
    // Wire the control to its error text so screen readers announce it. The
    // error div gets a lazy unique id (reusing fieldUid); aria-describedby points
    // the field at it, and aria-invalid flags the field as failing validation.
    if (!errEl.id) errEl.id = fieldUid(path) + '-error';
    // For searchSelect, [data-path] is the hidden anchor; aim the ARIA at the
    // visible input the user actually focuses (it already carries the label id).
    const target = wrap.querySelector('.searchselect__input') || el;
    target.setAttribute('aria-invalid', 'true');
    target.setAttribute('aria-describedby', errEl.id);
  }
}

function clearFieldError(el) {
  const wrap = el.closest('.field');
  if (!wrap) return;
  wrap.classList.remove('is-error');
  const errEl = wrap.querySelector('.field__error');
  if (errEl) errEl.textContent = '';
  // Drop the ARIA error wiring set by showFieldError. Mirror its target so the
  // searchSelect's visible input is cleared (not the hidden anchor). Removing
  // absent attributes is harmless, so no guard is needed here.
  const target = wrap.querySelector('.searchselect__input') || el;
  target.removeAttribute('aria-invalid');
  target.removeAttribute('aria-describedby');
}

// ---- go ------------------------------------------------------------------

init();
