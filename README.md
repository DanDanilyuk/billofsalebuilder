# Virginia Vehicle Bill of Sale

A static, browser-only wizard that produces a downloadable PDF Vehicle Bill of Sale containing the fields commonly required for a private vehicle transfer in the Commonwealth of Virginia.

## Overview

Five short steps collect the vehicle, seller, buyer, and sale details. The wizard previews the generated PDF in-browser, then offers it as a download. Nothing is sent to a server; all data lives in your browser's `localStorage` until you clear the form.

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

## Project structure

```
bill_of_sale/
├── index.html            # wizard chrome and step containers
├── css/styles.css        # editorial-mono theme
├── js/
│   ├── app.js            # wizard state machine, navigation, render
│   ├── fields.js         # per-vehicle-type field definitions
│   ├── validation.js     # VIN / HIN / year / ZIP / price rules
│   ├── storage.js        # localStorage save / restore / clear
│   ├── copy.js           # all UI text (single source of truth)
│   ├── pdf.js            # jsPDF document builder
│   └── vin-decoder.js    # NHTSA vPIC VIN auto-decode
├── lib/jspdf.umd.min.js  # vendored, no CDN at runtime
└── assets/fonts/         # Inter woff2 (self-hosted)
```

## Required fields by vehicle type

All vehicle types require year, make, model, color, body / sub-type, seller and buyer name and address, sale price (or Gift), sale date, payment method, and the as-is acknowledgment.

| Field | Motor vehicle | Trailer | Boat |
|---|---|---|---|
| VIN (17 characters, no I/O/Q) | Required | - | - |
| VIN or serial number | - | Required | - |
| HIN (12 characters) | - | - | Required |
| Length (feet) | - | Required | Required |
| Hull material | - | - | Required |
| Odometer reading and unit | Required | - | - |
| Odometer accuracy statement | Required | - | - |

Phone numbers and driver's license / ID numbers are optional for both parties.

## Browser support

Latest versions of Chrome, Safari, Firefox, and Edge. The code targets ES2020 and uses native ES modules; no transpiling is performed.

## Disclaimer

This project is provided as-is for convenience. It is not legal advice and is not a substitute for the Virginia Department of Motor Vehicles' title transfer requirements. Verify current VA DMV requirements at https://www.dmv.virginia.gov before relying on any document produced by this tool. Use at your own risk.
