# Vehicle Bill of Sale (Virginia) - Design Spec

Date: 2026-05-07

## Goal

A static website that walks a user through a 5-step wizard, collects the fields required for a valid Virginia vehicle bill of sale, and produces a downloadable PDF the user can sign and print.

## Non-goals

- Filling Virginia's official VSA-66 PDF template
- Multi-party (joint buyer/seller) transactions
- Notary acknowledgment block
- Lien holder disclosure
- Trade-in itemization
- Server-side persistence, accounts, payments
- States other than Virginia

## Stack

- Vanilla HTML, CSS, JavaScript - no frameworks
- jsPDF (vendored locally) for PDF generation
- localStorage for in-browser persistence

## File layout

```
bill_of_sale/
├── index.html
├── css/styles.css
├── js/
│   ├── app.js          # wizard state machine, step navigation
│   ├── fields.js       # per-vehicle-type field definitions
│   ├── validation.js   # VIN/HIN, year, ZIP, currency rules
│   ├── storage.js      # localStorage save/restore/clear
│   └── pdf.js          # jsPDF document builder + preview
├── lib/jspdf.umd.min.js
├── assets/fonts/Inter-*.woff2
├── docs/superpowers/specs/2026-05-07-va-bill-of-sale-design.md
└── README.md
```

## Wizard flow (5 steps)

### Step 1 - Vehicle

- Type (radio, required): Motor vehicle / Trailer / Boat
- Year (required): 1900..current+1
- Make, Model (required)
- Color (required)
- Identifier (required, format depends on type):
  - Motor vehicle: VIN, exactly 17 chars, A-Z0-9 minus I/O/Q
  - Trailer: VIN or serial number, plus length
  - Boat: HIN, exactly 12 chars, plus hull length and material
- Body / sub-type (required):
  - Motor vehicle: Sedan / SUV / Truck / Van / Coupe / Motorcycle / Other
  - Trailer: Utility / Cargo / Boat trailer / Other
  - Boat: Powerboat / Sailboat / Personal watercraft / Other
  - Selecting "Other" reveals a required free-text input
- Odometer reading + unit (miles/km) - **motor vehicles only, required**
- Odometer status (radio, motor vehicles only): Actual mileage / Not the actual mileage / Exceeds mechanical limits

### Step 2 - Seller

- Full name (required)
- Street, City, State, ZIP (all required; State defaults to VA)
- Phone (optional)
- Driver's license / ID # (optional)

### Step 3 - Buyer

Same fields as Seller.

### Step 4 - Sale terms

- Sale price USD (required when payment method is not Gift; positive number)
- Sale date (required, defaults to today)
- Payment method (radio, required): Cash / Check / Money order / Financed / Gift / Other
- "As-is" acknowledgment checkbox (required) - "I understand the vehicle is sold as-is with no warranties expressed or implied."
- When payment method is "Gift": sale price field is hidden, treated as $0, and the PDF acknowledgment swaps to "as a gift, with no monetary consideration."
- When payment method is "Other": a required free-text "describe payment" input appears.

### Step 5 - Review

- Embedded PDF preview in `<iframe>`
- Buttons: "Back to edit" (returns to Step 4) and "Download PDF"
- Filename: `va-bill-of-sale-{seller-lastname}-{YYYY-MM-DD}.pdf`

## Validation

Block "Continue" until all required fields on the current step are valid. Inline error messages appear under each field in 12px red, never as alerts or tooltips.

| Field | Rule |
|---|---|
| VIN | Exactly 17 chars, A-Z0-9 minus I/O/Q |
| HIN | Exactly 12 chars |
| Year | Integer 1900..current+1 |
| ZIP | `\d{5}` or `\d{5}-\d{4}` |
| Sale price | Positive number, max 8 digits before decimal |
| Phone | If present: 10 digits (any common separators) |
| Sale date | Valid date, not more than 1 day in the future |

## PDF document

- US Letter (8.5" x 11"), 0.75" margins
- One page for typical sales; addresses overflow to page 2 if needed
- Sections in order: title block, Seller, Buyer, Vehicle, Sale, Acknowledgment, Signatures, footer
- Inter (TTF embedded) for body, built-in Courier for VIN/HIN/serial
- Title: "VEHICLE BILL OF SALE", subtitle "Commonwealth of Virginia"
- Acknowledgment language (neutral, generally-accepted phrasing):
  > The Seller transfers all right, title, and interest in the vehicle described above to the Buyer for the consideration stated. The vehicle is sold AS-IS, with no warranties expressed or implied. The Seller certifies the odometer reading is correct to the best of their knowledge.
- Footer disclaimer: "Generated [timestamp]. Not a substitute for Virginia DMV title transfer requirements."
- Conditional: odometer block hidden for trailers/boats; HIN replaces VIN for boats; trailer/hull length appears only when relevant.

## Persistence

- On every input change, write the current form state to `localStorage` under the key `va-bill-of-sale:draft:v1`.
- On page load, restore from that key if present.
- "Clear form" button on Step 1 wipes the key and resets state.

## Visual design - Editorial mono

- Background `#fafaf9`, surface `#ffffff`, ink `#0a0a0a`, muted `#737373`, subtle `#e5e5e5`, error `#b91c1c`
- Single accent: ink (`#0a0a0a`) for primary actions; no other brand color
- Radius 6px on inputs/buttons, 10px on cards; spacing 4 / 8 / 12 / 16 / 24 / 32 / 48 px
- Type: Inter (self-hosted woff2) for sans, system mono stack for monospace
- Scale: 12 / 13 / 14 / 16 / 20 / 24 / 32 px - body 14, step title 24
- Wizard chrome: 4-segment progress bar, "Step N of 5" eyebrow in 11px uppercase, step title 24/600
- Single column, 480px max-width, centered
- Sticky bottom action row: ghost "Back" + solid black "Continue"
- VIN/HIN inputs use mono with letter-spacing
- Inline error in red 12px under field (never tooltip/alert)
- Mobile: same layout, single column, 44px min targets, tested at 393x852
- No emoji, gradients, or decorative illustrations

## Browser support

- Latest Chrome, Safari, Firefox, Edge
- ES2020 baseline (no transpiling)

## Verification

Per the user's CLAUDE.md, Playwright MCP screenshot pass at 1710x1117 (desktop) and 393x852 (mobile) before sign-off, covering:

- Each vehicle type path (motor / trailer / boat)
- Required-field validation messages
- Persistence across reload
- PDF preview rendering and download
- Mobile layout and 44px touch targets

## Team

5 subagents, tmux split-pane (per global CLAUDE.md):

| # | Role | Tools | Owns |
|---|---|---|---|
| 1 | Frontend dev | frontend-design plugin | `index.html`, `css/styles.css` |
| 2 | Wizard / state engineer | vanilla JS | `js/app.js`, `js/fields.js`, `js/validation.js`, `js/storage.js` |
| 3 | PDF engineer | jsPDF | `js/pdf.js`, `lib/jspdf.umd.min.js`, font embedding |
| 4 | Copywriter | text only | All labels, helper text, error messages, acknowledgment language, README |
| 5 | QA | Playwright MCP | End-to-end verification at desktop + mobile, all vehicle types |

Phasing:
1. Parallel: Frontend (1), PDF prototype (3), Copywriter (4)
2. Wizard wiring (2) using established HTML/CSS, copy, and PDF API
3. QA (5) on the integrated build
