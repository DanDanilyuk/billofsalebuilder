# Virginia Vehicle Bill of Sale - Implementation Plan

> **For agentic workers:** This plan is dispatched to a 5-role tmux split-pane AgentTeam. Tasks are owned by named roles. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static HTML/CSS/JS website with a 5-step wizard that produces a downloadable PDF Vehicle Bill of Sale containing all fields required for a valid Virginia transaction.

**Architecture:** Single-page static site. Wizard steps swap via JS. State stored in a single object mirrored to `localStorage` on every change. PDF rendered with jsPDF using the same state object; previewed in an iframe before download.

**Tech Stack:** Vanilla HTML / CSS / JavaScript (ES2020), jsPDF (vendored), no build step.

**Spec:** [`docs/superpowers/specs/2026-05-07-va-bill-of-sale-design.md`](../specs/2026-05-07-va-bill-of-sale-design.md)

---

## Team & phases

| # | Role | Tools |
|---|---|---|
| 1 | Frontend dev | frontend-design plugin |
| 2 | Wizard / state engineer | vanilla JS |
| 3 | PDF engineer | jsPDF |
| 4 | Copywriter | text only |
| 5 | QA | Playwright MCP |

**Phase 1 (parallel):** Task 1 (Frontend), Task 2 (Copy), Task 3 (PDF prototype).
**Phase 2 (sequential after Phase 1):** Task 4 (Wizard wiring), Task 5 (PDF integration).
**Phase 3:** Task 6 (QA).

Lead (me) reviews each task before unblocking dependents.

---

## Shared contract: form state shape

All roles use this exact shape. Wizard engineer writes it; PDF engineer reads it.

```js
// localStorage key: "va-bill-of-sale:draft:v1"
const state = {
  vehicle: {
    type: "motor" | "trailer" | "boat",     // Step 1
    year: "2018",
    make: "Toyota",
    model: "Camry",
    color: "Silver",
    subType: "Sedan",                         // dropdown selection
    subTypeOther: "",                         // populated when subType === "Other"
    vin: "4T1B11HK5JU123456",                 // motor + trailer (serial OK for trailer)
    hin: "",                                  // boat only
    length: "",                               // trailer + boat
    hullMaterial: "",                         // boat only
    odometer: "67432",                        // motor only
    odometerUnit: "miles" | "km",             // motor only
    odometerStatus: "actual" | "not_actual" | "exceeds",
  },
  seller: {
    name: "Jane Q. Seller",
    street: "123 Main St",
    city: "Richmond",
    state: "VA",
    zip: "23220",
    phone: "",
    license: "",
  },
  buyer: { /* same shape as seller */ },
  sale: {
    price: "12500.00",                         // string, parsed at PDF time
    date: "2026-05-07",                        // ISO
    payment: "cash" | "check" | "money_order" | "financed" | "gift" | "other",
    paymentOther: "",                          // populated when payment === "other"
    asIsAck: true,
  },
  meta: {
    version: 1,
    updatedAt: "2026-05-07T12:34:56.000Z",
  },
};
```

---

## Task 1 - Frontend scaffold + theme

**Owner:** Frontend dev
**Tools:** frontend-design plugin
**Phase:** 1 (parallel)

**Files:**
- Create: `/Users/dan/Projects/bill_of_sale/index.html`
- Create: `/Users/dan/Projects/bill_of_sale/css/styles.css`
- Create: `/Users/dan/Projects/bill_of_sale/assets/fonts/` (download Inter Regular + Medium + SemiBold woff2 from rsms.me/inter, self-hosted)

**Deliverables:**

- [ ] **Step 1: Create `index.html`** with this structure:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Virginia Vehicle Bill of Sale</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <header class="page-header">
    <div class="brand">Vehicle Bill of Sale</div>
    <div class="brand-sub">Commonwealth of Virginia</div>
  </header>

  <main class="wizard">
    <div class="progress" aria-label="Wizard progress">
      <span class="progress__seg" data-step="1"></span>
      <span class="progress__seg" data-step="2"></span>
      <span class="progress__seg" data-step="3"></span>
      <span class="progress__seg" data-step="4"></span>
      <span class="progress__seg" data-step="5"></span>
    </div>

    <section class="step" data-step="1" hidden>
      <div class="eyebrow">Step 1 of 5</div>
      <h1 class="step__title">Vehicle</h1>
      <p class="step__sub">What's being sold.</p>
      <form class="step__form" data-step-form="1"><!-- fields injected by app.js --></form>
    </section>

    <section class="step" data-step="2" hidden>
      <div class="eyebrow">Step 2 of 5</div>
      <h1 class="step__title">Seller</h1>
      <p class="step__sub">Who is selling the vehicle.</p>
      <form class="step__form" data-step-form="2"></form>
    </section>

    <section class="step" data-step="3" hidden>
      <div class="eyebrow">Step 3 of 5</div>
      <h1 class="step__title">Buyer</h1>
      <p class="step__sub">Who is purchasing the vehicle.</p>
      <form class="step__form" data-step-form="3"></form>
    </section>

    <section class="step" data-step="4" hidden>
      <div class="eyebrow">Step 4 of 5</div>
      <h1 class="step__title">Sale terms</h1>
      <p class="step__sub">Price, date, and payment.</p>
      <form class="step__form" data-step-form="4"></form>
    </section>

    <section class="step" data-step="5" hidden>
      <div class="eyebrow">Step 5 of 5</div>
      <h1 class="step__title">Review &amp; download</h1>
      <p class="step__sub">Verify the document below, then download.</p>
      <iframe class="pdf-preview" title="Bill of Sale preview"></iframe>
    </section>

    <div class="actions">
      <button type="button" class="btn btn--ghost" data-action="back">Back</button>
      <button type="button" class="btn btn--secondary" data-action="clear" hidden>Clear form</button>
      <button type="button" class="btn btn--primary" data-action="continue">Continue</button>
      <a class="btn btn--primary" data-action="download" hidden>Download PDF</a>
    </div>
  </main>

  <footer class="page-footer">
    Not a substitute for Virginia DMV title transfer requirements.
  </footer>

  <script src="lib/jspdf.umd.min.js"></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `css/styles.css`** with the editorial-mono token system:

```css
@font-face {
  font-family: 'Inter';
  src: url('../assets/fonts/Inter-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Inter';
  src: url('../assets/fonts/Inter-Medium.woff2') format('woff2');
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: 'Inter';
  src: url('../assets/fonts/Inter-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-display: swap;
}

:root {
  --bg: #fafaf9;
  --surface: #ffffff;
  --ink: #0a0a0a;
  --muted: #737373;
  --subtle: #e5e5e5;
  --error: #b91c1c;
  --radius-sm: 6px;
  --radius-md: 10px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --max-width: 480px;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--ink);
  font: 400 14px/1.5 var(--font-sans);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.page-header {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  border-bottom: 1px solid var(--subtle);
}
.brand { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
.brand-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }

.wizard {
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-8) var(--space-4) var(--space-12);
  flex: 1;
}

.progress { display: flex; gap: var(--space-1); margin-bottom: var(--space-8); }
.progress__seg {
  flex: 1; height: 3px; background: var(--subtle); border-radius: 2px;
  transition: background 0.2s;
}
.progress__seg.is-done, .progress__seg.is-current { background: var(--ink); }

.eyebrow {
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--muted); margin-bottom: var(--space-2);
}
.step__title { font-size: 24px; font-weight: 600; margin: 0 0 var(--space-1); letter-spacing: -0.02em; }
.step__sub { color: var(--muted); margin: 0 0 var(--space-6); font-size: 13px; }

.field { margin-bottom: var(--space-4); }
.field__label { display: block; font-size: 12px; font-weight: 500; margin-bottom: var(--space-1); }
.field__label .req { color: var(--error); margin-left: 2px; }
.field__row { display: flex; gap: var(--space-2); }
.field__row > .field { flex: 1; }
.field__hint { font-size: 11px; color: var(--muted); margin-top: var(--space-1); }
.field__error { font-size: 12px; color: var(--error); margin-top: var(--space-1); display: none; }
.field.is-error .field__error { display: block; }
.field.is-error .input { border-color: var(--error); }

.input, .select, .textarea {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--subtle);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font: inherit;
  color: var(--ink);
  transition: border-color 0.15s;
  min-height: 40px;
}
.input:focus, .select:focus, .textarea:focus {
  outline: none;
  border-color: var(--ink);
  border-width: 1px;
}
.input--mono { font-family: var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; }
.select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' width='12' height='8'%3E%3Cpath fill='none' stroke='%230a0a0a' stroke-width='1.5' d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; }

.radio-group, .checkbox-group { display: flex; flex-direction: column; gap: var(--space-2); }
.radio, .checkbox {
  display: flex; align-items: flex-start; gap: var(--space-2);
  padding: 12px;
  border: 1px solid var(--subtle); border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  font-size: 13px;
  min-height: 44px;
}
.radio.is-selected, .checkbox.is-selected { border-color: var(--ink); }
.radio input, .checkbox input { margin: 0; accent-color: var(--ink); }

.actions {
  position: sticky; bottom: 0;
  display: flex; gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(to top, var(--bg) 60%, transparent);
  margin: 0 calc(-1 * var(--space-4));
}
.btn {
  flex: 1;
  min-height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0 var(--space-4);
  font: 500 14px/1 var(--font-sans);
  cursor: pointer;
  text-decoration: none;
  background: var(--surface);
  color: var(--ink);
  transition: background 0.15s, border-color 0.15s;
}
.btn--ghost { border-color: var(--subtle); }
.btn--ghost:hover { border-color: var(--ink); }
.btn--secondary { color: var(--muted); border-color: var(--subtle); }
.btn--primary { background: var(--ink); color: var(--bg); flex: 2; }
.btn--primary:hover { background: #1a1a1a; }
.btn[disabled] { opacity: 0.4; cursor: not-allowed; }

.pdf-preview {
  width: 100%; height: 70vh;
  border: 1px solid var(--subtle); border-radius: var(--radius-md);
  background: var(--surface);
}

.page-footer {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  border-top: 1px solid var(--subtle);
}

@media (max-width: 480px) {
  .wizard { padding: var(--space-6) var(--space-3) var(--space-12); }
  .actions { flex-direction: column; }
  .btn--primary { flex: 1; }
}
```

- [ ] **Step 3: Download Inter font subset** (Regular 400, Medium 500, SemiBold 600) into `assets/fonts/` as `.woff2`. Source: https://rsms.me/inter/download/.

- [ ] **Step 4: Verify in browser** by opening `index.html` directly. The header, progress bar, and step containers should be visible (steps are hidden initially - this is expected; app.js will show step 1).

- [ ] **Step 5: Hand off** by signaling done in the team channel. No commit needed yet (Phase 1 commits at end).

---

## Task 2 - Copy deck

**Owner:** Copywriter
**Tools:** text only
**Phase:** 1 (parallel)

**Files:**
- Create: `/Users/dan/Projects/bill_of_sale/js/copy.js` (single source of truth for all UI text)
- Create: `/Users/dan/Projects/bill_of_sale/README.md`

**Deliverables:**

- [ ] **Step 1: Create `js/copy.js`** exporting an `export const COPY` object. Tone: clear, neutral, slightly formal. No exclamation marks, no emoji. Each label sentence-case, max 4 words where possible. Helper text in 1 short sentence. Errors specific and actionable.

Required keys (the wizard engineer will reference these by path - keys are exact):

```js
export const COPY = {
  app: {
    title: "Vehicle Bill of Sale",
    subtitle: "Commonwealth of Virginia",
    footerDisclaimer: "Not a substitute for Virginia DMV title transfer requirements.",
  },
  actions: { back: "Back", continue: "Continue", clear: "Clear form", download: "Download PDF", backToEdit: "Back to edit" },
  step1: {
    title: "Vehicle",
    sub: "What's being sold.",
    type: { label: "Vehicle type", req: true, options: { motor: "Motor vehicle", trailer: "Trailer", boat: "Boat" } },
    year: { label: "Year", req: true, hint: "" },
    make: { label: "Make", req: true },
    model: { label: "Model", req: true },
    color: { label: "Color", req: true },
    vin: { label: "VIN", req: true, hint: "17 characters. We exclude letters I, O, and Q." },
    serial: { label: "VIN or serial number", req: true },
    hin: { label: "HIN", req: true, hint: "12 characters - hull identification number." },
    length: { label: "Length (feet)", req: true },
    hullMaterial: { label: "Hull material", req: true, options: { fiberglass: "Fiberglass", aluminum: "Aluminum", wood: "Wood", steel: "Steel", other: "Other" } },
    subType: {
      label: "Body type",
      req: true,
      motor: { sedan: "Sedan", suv: "SUV", truck: "Truck", van: "Van", coupe: "Coupe", motorcycle: "Motorcycle", other: "Other" },
      trailer: { utility: "Utility", cargo: "Cargo", boatTrailer: "Boat trailer", other: "Other" },
      boat: { powerboat: "Powerboat", sailboat: "Sailboat", pwc: "Personal watercraft", other: "Other" },
    },
    subTypeOther: { label: "Describe", req: true },
    odometer: { label: "Odometer reading", req: true },
    odometerUnit: { label: "Unit", req: true, options: { miles: "Miles", km: "Kilometers" } },
    odometerStatus: {
      label: "Odometer accuracy",
      req: true,
      options: {
        actual: "Reflects actual mileage",
        not_actual: "Does not reflect actual mileage",
        exceeds: "Exceeds mechanical limits",
      },
    },
  },
  parties: {
    name: { label: "Full name", req: true },
    street: { label: "Street address", req: true },
    city: { label: "City", req: true },
    state: { label: "State", req: true },
    zip: { label: "ZIP", req: true },
    phone: { label: "Phone (optional)", req: false },
    license: { label: "Driver's license / ID number (optional)", req: false, hint: "Helps Virginia DMV match the title." },
  },
  step2: { title: "Seller", sub: "Who is selling the vehicle." },
  step3: { title: "Buyer", sub: "Who is purchasing the vehicle." },
  step4: {
    title: "Sale terms",
    sub: "Price, date, and payment.",
    price: { label: "Sale price (USD)", req: true, hint: "Enter 0 or use Gift if no money is exchanged." },
    date: { label: "Date of sale", req: true },
    payment: {
      label: "Payment method", req: true,
      options: { cash: "Cash", check: "Check", money_order: "Money order", financed: "Financed", gift: "Gift (no money exchanged)", other: "Other" },
    },
    paymentOther: { label: "Describe payment", req: true },
    asIsAck: { label: "I understand the vehicle is sold as-is, with no warranties expressed or implied.", req: true },
  },
  step5: {
    title: "Review & download",
    sub: "Verify the document below, then download.",
  },
  errors: {
    required: "Required.",
    vin: "Must be exactly 17 characters; letters I, O, and Q are not allowed.",
    hin: "Must be exactly 12 characters.",
    year: "Enter a year between 1900 and next year.",
    zip: "Use the format 12345 or 12345-6789.",
    price: "Enter a positive amount.",
    date: "Enter a valid date.",
    dateFuture: "Sale date can't be in the future.",
    phone: "Enter a 10-digit phone number.",
  },
  pdf: {
    title: "VEHICLE BILL OF SALE",
    subtitle: "Commonwealth of Virginia",
    sellerHeading: "SELLER",
    buyerHeading: "BUYER",
    vehicleHeading: "VEHICLE",
    saleHeading: "SALE",
    ackHeading: "ACKNOWLEDGMENT",
    signaturesHeading: "SIGNATURES",
    ackBody: "The Seller transfers all right, title, and interest in the vehicle described above to the Buyer for the consideration stated. The vehicle is sold AS-IS, with no warranties expressed or implied. The Seller certifies the odometer reading is correct to the best of their knowledge.",
    ackBodyGift: "The Seller transfers all right, title, and interest in the vehicle described above to the Buyer as a gift, with no monetary consideration. The vehicle is transferred AS-IS, with no warranties expressed or implied.",
    sellerSignatureLabel: "Seller signature",
    buyerSignatureLabel: "Buyer signature",
    dateLabel: "Date",
    footerDisclaimer: "Generated {timestamp}. Not a substitute for Virginia DMV title transfer requirements.",
  },
};
```

- [ ] **Step 2: Create `README.md`** with sections: Overview, Getting started (open `index.html`), Project structure, Required fields by vehicle type, Browser support, License-style disclaimer that this isn't legal advice. Keep under 80 lines.

- [ ] **Step 3: Hand off** - signal team channel.

---

## Task 3 - PDF prototype

**Owner:** PDF engineer
**Tools:** jsPDF
**Phase:** 1 (parallel - can use mock state from the spec until Task 4 lands)

**Files:**
- Create: `/Users/dan/Projects/bill_of_sale/lib/jspdf.umd.min.js` (vendored from `https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js` - download once, commit; no runtime CDN load)
- Create: `/Users/dan/Projects/bill_of_sale/js/pdf.js`

**Deliverables:**

- [ ] **Step 1: Vendor jsPDF.** Download to `lib/jspdf.umd.min.js`:

```bash
curl -L -o lib/jspdf.umd.min.js https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js
```

Verify the file size is ~350KB and starts with `/*! jsPDF v2.5.1`.

- [ ] **Step 2: Create `js/pdf.js`** as an ES module. The exported function takes the shared state object and returns a Blob. Uses jsPDF's built-in Helvetica + Courier (no custom font embedding for v1 - keeps file size small and avoids TTF wrangling). Key requirements:

```js
import { COPY } from './copy.js';

const MARGIN = 54;          // 0.75" at 72dpi
const PAGE_W = 612;         // 8.5" at 72
const PAGE_H = 792;         // 11" at 72
const CONTENT_W = PAGE_W - MARGIN * 2;

const TYPE_LABEL = { motor: 'Motor vehicle', trailer: 'Trailer', boat: 'Boat' };
const SUBTYPE_LABEL = COPY.step1.subType;
const ODO_STATUS = {
  actual: 'Reflects actual mileage',
  not_actual: 'Does not reflect actual mileage',
  exceeds: 'Exceeds mechanical limits',
};
const PAYMENT_LABEL = COPY.step4.payment.options;
const HULL_LABEL = COPY.step1.hullMaterial.options;

export function buildBillOfSalePdf(state) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = MARGIN;

  // Title block
  doc.setFont('helvetica', 'bold').setFontSize(18);
  doc.text(COPY.pdf.title, MARGIN, y);
  y += 22;
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(115);
  doc.text(COPY.pdf.subtitle, MARGIN, y);
  doc.setTextColor(10);
  doc.text(formatDateLong(state.sale.date), PAGE_W - MARGIN, y, { align: 'right' });
  y += 10;
  doc.setDrawColor(229).line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 24;

  y = drawParty(doc, y, COPY.pdf.sellerHeading, state.seller);
  y = drawParty(doc, y, COPY.pdf.buyerHeading, state.buyer);
  y = drawVehicle(doc, y, state.vehicle);
  y = drawSale(doc, y, state.sale);
  y = drawAck(doc, y, state.sale);
  y = drawSignatures(doc, y);
  drawFooter(doc);

  return doc.output('blob');
}

// Helper functions: drawParty, drawVehicle, drawSale, drawAck, drawSignatures, drawFooter,
// formatDateLong (Mon DD, YYYY), formatPrice ($X,XXX.XX), formatVin (mono via Courier).
// Each helper:
//   - Sets section heading at MARGIN, y in 11pt Helvetica-Bold uppercase.
//   - Indents body 14pt right of MARGIN.
//   - Returns the new y.
//   - Adds 18pt spacing between sections.
//   - For VIN/HIN/serial use doc.setFont('courier', 'normal').
```

- [ ] **Step 3: Implement helpers** with these exact rules:
  - `drawParty`: prints heading; then "Name:", "Address:", "DL/ID:" (DL/ID line omitted if empty); two-line address joined as "{street}, {city}, {state} {zip}".
  - `drawVehicle`: heading; first line is `{year} {make} {model} {color}, {subTypeLabel}`; identifier line uses Courier; for motor vehicles, odometer line: `Odometer: {value} {miles|km} ({odoStatusLabel})`; for boats: hull length and material; for trailers: length only when present.
  - `drawSale`: heading; "Sale price:", "Date of sale:", "Payment:" (use `paymentOther` text when payment is "other"; for "gift", price line says "Gift - no monetary consideration").
  - `drawAck`: heading; body wrapped to `CONTENT_W` using `doc.splitTextToSize`. If `state.sale.payment === 'gift'` use `COPY.pdf.ackBodyGift`, else `COPY.pdf.ackBody`. 10pt size, 1.4 line height.
  - `drawSignatures`: heading; two signature blocks (Seller, Buyer). Each block is a horizontal line ~280pt, label below in 9pt; date line ~110pt to the right; gap of 24pt between Seller and Buyer blocks.
  - `drawFooter`: at `PAGE_H - 36`, 8pt muted text, centered, with `{timestamp}` replaced by `new Date().toLocaleString()`.
  - `formatPrice`: `$12,500.00` style; handles `payment === 'gift'` by returning `'Gift'`.

- [ ] **Step 4: Write a `__test/preview.html`** harness (don't ship in final, but useful during build). It should import pdf.js, call `buildBillOfSalePdf` with a hardcoded sample state covering all three vehicle types, and render each blob to an iframe. Verify visually before integration.

- [ ] **Step 5: Hand off** - signal that `buildBillOfSalePdf(state)` is callable.

---

## Task 4 - Wizard state, navigation, validation, persistence

**Owner:** Wizard / state engineer
**Tools:** vanilla JS
**Phase:** 2 (depends on Tasks 1 and 2)

**Files:**
- Create: `/Users/dan/Projects/bill_of_sale/js/fields.js`
- Create: `/Users/dan/Projects/bill_of_sale/js/validation.js`
- Create: `/Users/dan/Projects/bill_of_sale/js/storage.js`
- Create: `/Users/dan/Projects/bill_of_sale/js/app.js`

**Deliverables:**

- [ ] **Step 1: Create `js/storage.js`** with these exports:

```js
const KEY = 'va-bill-of-sale:draft:v1';

export function loadState(defaultState) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    if (parsed?.meta?.version !== 1) return structuredClone(defaultState);
    return parsed;
  } catch {
    return structuredClone(defaultState);
  }
}

export function saveState(state) {
  state.meta = { version: 1, updatedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(KEY);
}

export function defaultState() {
  return {
    vehicle: { type: 'motor', year: '', make: '', model: '', color: '', subType: '', subTypeOther: '', vin: '', hin: '', length: '', hullMaterial: '', odometer: '', odometerUnit: 'miles', odometerStatus: 'actual' },
    seller: { name: '', street: '', city: '', state: 'VA', zip: '', phone: '', license: '' },
    buyer:  { name: '', street: '', city: '', state: 'VA', zip: '', phone: '', license: '' },
    sale:   { price: '', date: new Date().toISOString().slice(0, 10), payment: 'cash', paymentOther: '', asIsAck: false },
    meta:   { version: 1, updatedAt: new Date().toISOString() },
  };
}
```

- [ ] **Step 2: Create `js/validation.js`** with pure functions:

```js
export const validators = {
  required: (v) => (v === '' || v == null || v === false) ? 'required' : null,
  vin: (v) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v.toUpperCase()) ? null : 'vin',
  hin: (v) => /^[A-Z0-9]{12}$/.test(v.toUpperCase()) ? null : 'hin',
  year: (v) => {
    const n = parseInt(v, 10);
    const max = new Date().getFullYear() + 1;
    return (Number.isInteger(n) && n >= 1900 && n <= max) ? null : 'year';
  },
  zip: (v) => /^\d{5}(-\d{4})?$/.test(v) ? null : 'zip',
  price: (v) => {
    const n = Number(v);
    return (Number.isFinite(n) && n >= 0 && n < 1e8) ? null : 'price';
  },
  date: (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
    const d = new Date(v + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return 'date';
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (d > tomorrow) return 'dateFuture';
    return null;
  },
  phoneOptional: (v) => v === '' ? null : (/^\d{10}$/.test(v.replace(/\D/g, '')) ? null : 'phone'),
};
```

- [ ] **Step 3: Create `js/fields.js`** that, given the current `state.vehicle.type`, returns the ordered field list per step. Each field has: `path` (e.g. `'vehicle.year'`), `label` (string from COPY), `req` (boolean), `kind` (`text|number|select|radio|date|checkbox|hidden`), optional `options`, optional `hint`, optional `validate` (array of validator names), optional `mono` (true for VIN/HIN), optional `showWhen(state)` predicate for conditional fields (subTypeOther, paymentOther, odometer block, hin/length/hullMaterial).

- [ ] **Step 4: Create `js/app.js`** - the main controller:

```js
import { COPY } from './copy.js';
import { defaultState, loadState, saveState, clearState } from './storage.js';
import { fieldsForStep } from './fields.js';
import { validators } from './validation.js';
import { buildBillOfSalePdf } from './pdf.js';

const TOTAL_STEPS = 5;
let state = loadState(defaultState());
let currentStep = 1;
let lastBlobUrl = null;

function init() {
  bindActions();
  renderStep(currentStep);
  updateProgress();
}

function renderStep(n) {
  document.querySelectorAll('.step').forEach(el => el.hidden = Number(el.dataset.step) !== n);
  if (n === 5) renderPreview();
  else renderForm(n);
  updateActions(n);
  updateProgress();
}

function renderForm(n) {
  const form = document.querySelector(`[data-step-form="${n}"]`);
  form.innerHTML = '';
  const fields = fieldsForStep(n, state);
  fields.forEach(f => form.appendChild(renderField(f)));
  form.querySelectorAll('input, select').forEach(el => el.addEventListener('input', onFieldChange));
  form.querySelectorAll('input, select').forEach(el => el.addEventListener('change', onFieldChange));
}

function renderField(field) { /* build .field DOM with label, control, error, hint */ }

function onFieldChange(e) {
  const path = e.target.dataset.path;
  const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  setByPath(state, path, value);
  saveState(state);
  // re-render current step if conditional fields might change
  if (path === 'vehicle.type' || path === 'vehicle.subType' || path === 'sale.payment') {
    renderForm(currentStep);
  }
  clearFieldError(e.target);
}

function validateStep(n) {
  const fields = fieldsForStep(n, state);
  let firstInvalid = null;
  let allValid = true;
  fields.forEach(f => {
    const value = getByPath(state, f.path);
    const err = runValidators(f, value);
    if (err) {
      allValid = false;
      showFieldError(f.path, err);
      if (!firstInvalid) firstInvalid = f.path;
    }
  });
  if (firstInvalid) document.querySelector(`[data-path="${firstInvalid}"]`)?.focus();
  return allValid;
}

function bindActions() {
  document.querySelector('[data-action="back"]').addEventListener('click', () => goto(currentStep - 1));
  document.querySelector('[data-action="continue"]').addEventListener('click', () => {
    if (validateStep(currentStep)) goto(currentStep + 1);
  });
  document.querySelector('[data-action="clear"]').addEventListener('click', () => {
    if (confirm('Clear the form? This cannot be undone.')) {
      clearState();
      state = defaultState();
      goto(1);
      renderStep(1);
    }
  });
  document.querySelector('[data-action="download"]').addEventListener('click', (e) => {
    e.preventDefault();
    triggerDownload();
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
  clear.hidden = n !== 1;
  if (n === TOTAL_STEPS) {
    cont.hidden = true; dl.hidden = false;
  } else {
    cont.hidden = false; dl.hidden = true;
    cont.textContent = n === TOTAL_STEPS - 1 ? 'Review' : COPY.actions.continue;
  }
}

function updateProgress() {
  document.querySelectorAll('.progress__seg').forEach(seg => {
    const n = Number(seg.dataset.step);
    seg.classList.toggle('is-done', n < currentStep);
    seg.classList.toggle('is-current', n === currentStep);
  });
}

function renderPreview() {
  const blob = buildBillOfSalePdf(state);
  if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
  lastBlobUrl = URL.createObjectURL(blob);
  document.querySelector('.pdf-preview').src = lastBlobUrl;
  document.querySelector('[data-action="download"]').href = lastBlobUrl;
  document.querySelector('[data-action="download"]').download = downloadFilename();
}

function triggerDownload() {
  // <a download> handles it; this is here in case we need extra logic later.
}

function downloadFilename() {
  const last = (state.seller.name.trim().split(/\s+/).pop() || 'seller').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `va-bill-of-sale-${last}-${state.sale.date}.pdf`;
}

function getByPath(obj, path) { return path.split('.').reduce((o, k) => o?.[k], obj); }
function setByPath(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  parts.reduce((o, k) => o[k] ??= {}, obj)[last] = value;
}
function runValidators(field, value) {
  if (field.req && validators.required(value)) return 'required';
  if (!field.validate) return null;
  for (const name of field.validate) {
    const err = validators[name]?.(value);
    if (err) return err;
  }
  return null;
}
function showFieldError(path, code) {
  const el = document.querySelector(`[data-path="${path}"]`);
  el.closest('.field').classList.add('is-error');
  el.closest('.field').querySelector('.field__error').textContent = COPY.errors[code] || COPY.errors.required;
}
function clearFieldError(el) { el.closest('.field')?.classList.remove('is-error'); }

init();
```

- [ ] **Step 5: Verify each path manually** by running through:
  - Motor vehicle → all required fields → review → preview iframe shows the PDF.
  - Trailer → odometer block hidden, length shown, identifier "VIN or serial".
  - Boat → HIN field with mono styling, length + hull material shown.
  - Reload mid-flow → form repopulates from localStorage.
  - Click "Clear form" on step 1 → fields reset, localStorage cleared.
  - Submit invalid (e.g. 16-char VIN) → error shows under field, focus jumps there.

- [ ] **Step 6: Hand off** - notify QA.

---

## Task 5 - PDF integration polish

**Owner:** PDF engineer
**Tools:** jsPDF
**Phase:** 2 (after Task 4)

- [ ] **Step 1: Run the wizard end-to-end** with a real fill on each vehicle type and inspect the PDF output. Verify:
  - Layout doesn't overflow with long names/addresses
  - Wrapping respects 0.75" margins
  - Acknowledgment text wraps cleanly
  - Signature blocks are flush right of margin and not cut
  - Footer disclaimer is on the bottom of page 1 (or last page)

- [ ] **Step 2: Patch any layout issues** found - prefer pulling tight before adding a page break, but if total height > available page after content, call `doc.addPage()` before signatures and re-anchor `y = MARGIN`.

- [ ] **Step 3: Hand off** - signal QA.

---

## Task 6 - QA verification

**Owner:** QA
**Tools:** Playwright MCP
**Phase:** 3 (after Tasks 4 + 5)

Per global CLAUDE.md: desktop 1710x1117 + mobile 393x852, MCP not CLI, batch evaluations into single `browser_evaluate` calls.

- [ ] **Step 1: Start a static server.** From the project root:

```bash
python3 -m http.server 8765
```

Run with `run_in_background: true` and `timeout: 600000` per CLAUDE.md guidance.

- [ ] **Step 2: Stub blocking popups** at page load (per CLAUDE.md):

```js
window.Notification = { requestPermission: () => Promise.resolve('denied'), permission: 'denied' };
window.alert = window.confirm = window.prompt = () => true; // Allow Clear form to proceed in tests
window.onbeforeunload = () => null;
```

Register `browser_handle_dialog` to auto-dismiss native dialogs.

- [ ] **Step 3: Desktop pass at 1710x1117.** Walk each vehicle type to PDF preview. After each step screenshot. Verify required-field validation by clicking Continue with empty fields. Verify localStorage persistence by reloading mid-flow.

- [ ] **Step 4: Mobile pass at 393x852.** Same paths. Verify 44px touch targets, action row stacks, no horizontal scroll, sticky bottom action row remains visible.

- [ ] **Step 5: PDF correctness.** For each vehicle type, download the PDF (via `browser_evaluate` returning the blob, or by following the download link), open it, and confirm:
  - Title block, Seller, Buyer, Vehicle, Sale, Acknowledgment, Signatures all present
  - Conditional fields rendered correctly (no odometer for trailer/boat; HIN for boat; gift acknowledgment for gift payment)
  - Mono VIN/HIN visually distinct
  - Footer disclaimer present with correct timestamp
  - Filename matches `va-bill-of-sale-{lastname}-{YYYY-MM-DD}.pdf`

- [ ] **Step 6: Report findings** - delete screenshots after review per CLAUDE.md guidance. Submit a punch-list of any defects with file:line refs to lead.

---

## Lead checkpoints (me)

- After Phase 1: open `index.html` in a browser - verify scaffold, theme, copy spot-check, sample PDF preview from `__test/preview.html`.
- After Phase 2: walk one full path manually, confirm preview renders, download works.
- After Phase 3: review QA punch-list, dispatch fixes, then sign off and present to user.

## Self-review

- Spec coverage: vehicle types (Task 4 fields.js), validation rules (Task 4 validation.js), wizard chrome (Task 1), copy (Task 2), PDF layout (Tasks 3+5), persistence (Task 4 storage.js), visual design (Task 1), QA (Task 6) - covered.
- Placeholders: `renderField()` body left abstract in Step 4 of Task 4 - this is the only abstraction; the wizard engineer fills it from the field config. Acceptable: the field rendering is a small, isolated detail and the contract (data-path, .field, .field__error) is explicit.
- Type consistency: `state` shape locked at top of plan; both Wizard engineer and PDF engineer reference identical paths.
