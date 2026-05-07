# Bill of Sale Builder

A static, browser-only wizard that produces a downloadable PDF Vehicle Bill of Sale for any US state (50 states + DC). State-aware: the generated document carries the correct honorific (Commonwealth of / State of / District of Columbia), DMV reference, and notary block, and the federal odometer disclosure follows the post-2021 (49 CFR 580) rules for motor vehicles.

- Live: https://www.billofsalebuilder.com/
- Source: https://github.com/DanDanilyuk/billofsalebuilder

## Overview

A six-step wizard collects state + role, your details, the other party's details, the vehicle, the sale terms, and finally previews the PDF. The PDF previews in-browser and downloads to disk. Nothing is sent to a server; all data lives in your browser's `localStorage` until you clear the form.

## Getting started

No build step, no dependencies to install. Open `index.html` in a modern browser:

```sh
open index.html
```

Or serve the directory locally if your browser blocks `file://` module imports:

```sh
python3 -m http.server 8765
# then visit http://localhost:8765
```

There's also a PDF iteration harness for working on document layout without filling out the wizard end-to-end:

```sh
# same server, then visit
http://localhost:8765/__test/preview.html
```

## Project structure

```
billofsalebuilder/
├── index.html               # wizard chrome and step containers
├── css/styles.css           # light + dark theme via [data-theme]
├── js/
│   ├── app.js               # wizard state machine, navigation, render, theme
│   ├── fields.js            # per-step / per-vehicle-type field definitions
│   ├── validation.js        # VIN / HIN / year / ZIP / price rules
│   ├── storage.js           # localStorage save / restore / clear
│   ├── copy.js              # all UI text (single source of truth)
│   ├── pdf.js               # jsPDF document builder
│   ├── states.js            # per-jurisdiction lookup (notary, honorific, DMV URL)
│   ├── vin-decoder.js       # NHTSA vPIC VIN auto-decode
│   └── zip-decoder.js       # ZIP -> city/state via api.zippopotam.us
├── lib/jspdf.umd.min.js     # vendored, no CDN at runtime
├── assets/fonts/            # Inter woff2 (self-hosted)
├── og.svg                   # social share card (1200x630)
├── favicon.svg              # 32x32 document icon
├── robots.txt               # allow all + sitemap reference
└── sitemap.xml              # single URL entry
```

## Wizard steps

1. **Setup** - state + role (Seller or Buyer)
2. **Your information** - first / middle / last name, address (street + apt/suite + ZIP-driven city/state autofill), phone, DL/ID
3. **Other party** - same fields, with a Skip toggle for handwriting
4. **Vehicle** - type (motor / trailer / boat), VIN or HIN with NHTSA auto-decode, year, make, model, color, length, odometer
5. **Sale terms** - price (or Gift), date, payment method, optional notary block
6. **Review & download** - PDF preview, then download

## Required fields by vehicle type

All vehicle types require year, make, model, color, body / sub-type, the seller's and buyer's names and addresses, sale price (or Gift), sale date, and payment method.

| Field | Motor vehicle | Trailer | Boat |
|---|---|---|---|
| VIN (17 characters, no I/O/Q) | Required | - | - |
| VIN or serial number | - | Required | - |
| HIN (12 characters) | - | - | Required |
| Length (feet) | - | Required | Required |
| Hull material | - | - | Required |
| Odometer reading and unit | Required | - | - |
| Odometer accuracy statement | Required | - | - |

Phone numbers, driver's license / ID numbers, and Apt / Suite / Unit are optional for both parties. Joint-title (two names on the title) is supported via a co-owner toggle on each party step.

## State-aware behavior

- **Honorific**: PDF subtitle uses "Commonwealth of {Name}" for KY / MA / PA / VA, "District of Columbia" (no "of"), and "State of {Name}" for the other 46.
- **Notary**: Only states whose `notary` value is `'required'` auto-check the notary block; `'recommended'` and `'optional'` leave the toggle visible but unchecked. `'not_required'` hides the toggle entirely.
- **Odometer threshold**: Federal post-2021 rule (49 CFR 580) sets the disclosure threshold at 20 model years. Vehicles older than that drop the certification sentence from the PDF acknowledgment.
- **DMV reference**: Footer of the PDF cites the state's official BoS form (when one exists) and links to its DMV title-transfer page.

## External services used

- **NHTSA vPIC** - VIN -> year/make/model/body. Free, no key, CORS-enabled.
- **api.zippopotam.us** - ZIP -> city/state. Free, no key, CORS-enabled. Fills city + state only when blank, so a value the user typed is never overwritten.

## Browser support

Latest versions of Chrome, Safari, Firefox, and Edge. The code targets ES2020 and uses native ES modules; no transpiling. The light/dark theme follows `prefers-color-scheme` by default and persists explicit choices to `localStorage`.

## Disclaimer

This project is provided as-is for convenience. It is not legal advice and is not a substitute for the title-transfer requirements of the relevant state's Department of Motor Vehicles. Verify current requirements with the DMV of the state where the title is being transferred before relying on any document produced by this tool. Use at your own risk.
