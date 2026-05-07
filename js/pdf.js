// js/pdf.js
//
// Builds a Vehicle Bill of Sale PDF using jsPDF (vendored at
// lib/jspdf.umd.min.js, exposed on window.jspdf). Helvetica + Courier
// only (no custom font embedding for v1).
//
// Public API:
//   buildBillOfSalePdf(state) -> Blob
//
// Reads from the shared state schema (vehicle / seller / buyer / sale /
// meta) and adapts title block, odometer cert, optional notary block, and
// footer to the jurisdiction recorded at `state.meta.usState`.

import { COPY } from './copy.js';
import { getState } from './states.js';

// Page geometry (US Letter at 72dpi, 0.75" margins).
const MARGIN = 54;
const PAGE_W = 612;
const PAGE_H = 792;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Color tokens (RGB). Matches site palette: ink #0a0a0a, muted #737373,
// subtle #e5e5e5.
const INK = [10, 10, 10];
const MUTED = [115, 115, 115];
const RULE = [229, 229, 229];

// Vertical rhythm.
const HEADING_GAP = 20;       // gap from heading baseline to first body line
const BODY_LINE_H = 14;       // 10pt body @ ~1.4 line height
const ACK_LINE_H = 14;        // 10pt ack @ ~1.4 line height
const SECTION_GAP = 18;       // gap between sections

// Body indent (relative to MARGIN).
const BODY_INDENT = MARGIN + 14;
const LABEL_W = 86;           // default width of inline labels like "Address:"
// Notary labels ("Commission expires:") are too long for the 86pt column;
// the notary block widens its label gutter via drawRow's `labelW` override.
const NOTARY_LABEL_W = 120;

// Static lookups.
const TYPE_LABEL = { motor: 'Motor vehicle', trailer: 'Trailer', boat: 'Boat' };
const ODO_STATUS = {
  actual: 'Actual mileage',
  not_actual: 'Not actual mileage',
  exceeds: 'Exceeds mechanical limits',
};

// ---- helpers --------------------------------------------------------------

function setColor(doc, rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setStroke(doc, rgb) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

// COPY key reads tolerate either the legacy numeric layout (step1 / step4)
// or the semantic layout shipped by wizard-engineer (vehicle / sale).
// Whichever is present wins; this keeps pdf.js working through the
// rename rollout without coupling shipping order.
function vehicleCopy() {
  return COPY.vehicle || COPY.step1 || {};
}

function saleCopy() {
  return COPY.sale || COPY.step4 || {};
}

function subTypeLabel(vehicle) {
  if (!vehicle.subType) return '';
  if (vehicle.subType === 'other') {
    return vehicle.subTypeOther?.trim() || 'Other';
  }
  const map = vehicleCopy().subType?.[vehicle.type] || {};
  return map[vehicle.subType] || vehicle.subType;
}

function hullMaterialLabel(key) {
  if (!key) return '';
  const opts = vehicleCopy().hullMaterial?.options || {};
  return opts[key] || key;
}

function paymentLabel(sale) {
  if (sale.payment === 'other') {
    return sale.paymentOther?.trim() || 'Other';
  }
  const opts = saleCopy().payment?.options || {};
  return opts[sale.payment] || sale.payment || '';
}

function formatDateLong(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatPrice(sale) {
  if (sale.payment === 'gift') return 'Gift';
  const n = Number(sale.price);
  if (!Number.isFinite(n)) return '$0.00';
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---- drawing primitives ---------------------------------------------------

function drawSectionHeading(doc, y, label) {
  doc.setFont('helvetica', 'bold').setFontSize(11);
  setColor(doc, INK);
  doc.text(String(label).toUpperCase(), MARGIN, y);
  // Thin rule under the heading aligned with the body indent.
  setStroke(doc, RULE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y + 4, PAGE_W - MARGIN, y + 4);
  return y + HEADING_GAP;
}

// Draws "Label:  value" where the value may wrap. Returns the new y.
//   opts.mono: true     - render the value in Courier (used for VIN/HIN)
//   opts.blank: true    - draw a horizontal underline at the value column
//                         instead of text (used when a section is left blank
//                         for handwriting)
//   opts.labelW: number - override the default label gutter width (used by
//                         the notary block whose labels are wider)
function drawRow(doc, y, label, value, opts = {}) {
  const text = value == null ? '' : String(value);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  setColor(doc, MUTED);
  doc.text(label, BODY_INDENT, y);

  const labelW = opts.labelW || LABEL_W;
  const valueW = CONTENT_W - 14 - labelW;
  const valueX = BODY_INDENT + labelW;

  if (opts.blank) {
    setStroke(doc, INK);
    doc.setLineWidth(0.5);
    // Sit the line slightly below the label baseline so it reads as a
    // writing line, not a strikethrough.
    doc.line(valueX, y + 2, valueX + valueW, y + 2);
    return y + BODY_LINE_H;
  }

  if (opts.mono) {
    doc.setFont('courier', 'normal').setFontSize(10);
  } else {
    doc.setFont('helvetica', 'normal').setFontSize(10);
  }
  setColor(doc, INK);

  const lines = text === '' ? [''] : doc.splitTextToSize(text, valueW);
  lines.forEach((line, i) => {
    doc.text(line, valueX, y + i * BODY_LINE_H);
  });
  return y + Math.max(1, lines.length) * BODY_LINE_H;
}

// ---- section drawers ------------------------------------------------------

function partyAddressLine(p) {
  if (!p) return '';
  const cityStateZip = [
    p.city?.trim() || '',
    [p.state?.trim() || '', p.zip?.trim() || ''].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  return [p.street?.trim() || '', cityStateZip].filter(Boolean).join(', ');
}

function partyFullName(p) {
  if (!p) return '';
  return [p.firstName, p.middleName, p.lastName]
    .map((s) => (s == null ? '' : String(s).trim()))
    .filter(Boolean)
    .join(' ');
}

function drawPartyEntry(doc, y, p) {
  y = drawRow(doc, y, 'Name:', partyFullName(p));
  y = drawRow(doc, y, 'Address:', partyAddressLine(p));
  if (p.phone && String(p.phone).trim()) {
    y = drawRow(doc, y, 'Phone:', p.phone);
  }
  if (p.license && String(p.license).trim()) {
    y = drawRow(doc, y, 'DL/ID:', p.license);
  }
  return y;
}

function drawParty(doc, y, heading, party) {
  y = drawSectionHeading(doc, y, heading);
  // skipFill renders blank lines for handwriting. Two pairs of Name/Address
  // rows so co-owners (joint title) both have a slot. Phone / DL-ID are
  // omitted in this mode (those rows are optional anyway).
  if (party && party.skipFill) {
    y = drawRow(doc, y, 'Name:', '', { blank: true });
    y = drawRow(doc, y, 'Address:', '', { blank: true });
    y += 6;
    y = drawRow(doc, y, 'Name:', '', { blank: true });
    y = drawRow(doc, y, 'Address:', '', { blank: true });
    return y + SECTION_GAP;
  }
  y = drawPartyEntry(doc, y, party);
  if (party && party.hasCoOwner && party.coOwner) {
    y += 6;
    // When the user marks "shares this address," copy primary's street/
    // city/state/zip onto the co-owner so the PDF reads cleanly without
    // making the user retype.
    const co = party.coOwnerSameAddress
      ? {
          ...party.coOwner,
          street: party.street,
          city: party.city,
          state: party.state,
          zip: party.zip,
        }
      : party.coOwner;
    y = drawPartyEntry(doc, y, co);
  }
  return y + SECTION_GAP;
}

function drawVehicle(doc, y, vehicle) {
  y = drawSectionHeading(doc, y, COPY.pdf.vehicleHeading);

  const sub = subTypeLabel(vehicle);
  const descParts = [vehicle.year, vehicle.make, vehicle.model, vehicle.color]
    .map(s => (s == null ? '' : String(s).trim()))
    .filter(Boolean);
  const desc = sub ? `${descParts.join(' ')}, ${sub}` : descParts.join(' ');

  y = drawRow(doc, y, 'Type:', TYPE_LABEL[vehicle.type] || vehicle.type || '');
  y = drawRow(doc, y, 'Description:', desc);

  if (vehicle.type === 'boat') {
    y = drawRow(doc, y, 'HIN:', (vehicle.hin || '').toUpperCase(), { mono: true });
    if (vehicle.length && String(vehicle.length).trim()) {
      y = drawRow(doc, y, 'Length:', `${vehicle.length} ft`);
    }
    if (vehicle.hullMaterial) {
      y = drawRow(doc, y, 'Hull:', hullMaterialLabel(vehicle.hullMaterial));
    }
  } else if (vehicle.type === 'trailer') {
    y = drawRow(doc, y, 'VIN / Serial:', (vehicle.vin || '').toUpperCase(), { mono: true });
    if (vehicle.length && String(vehicle.length).trim()) {
      y = drawRow(doc, y, 'Length:', `${vehicle.length} ft`);
    }
  } else {
    // motor
    y = drawRow(doc, y, 'VIN:', (vehicle.vin || '').toUpperCase(), { mono: true });
    const unit = vehicle.odometerUnit === 'km' ? 'km' : 'miles';
    const status = ODO_STATUS[vehicle.odometerStatus] || '';
    const odo = `${vehicle.odometer || ''} ${unit}${status ? ` (${status})` : ''}`;
    y = drawRow(doc, y, 'Odometer:', odo);
  }
  return y + SECTION_GAP;
}

function drawSale(doc, y, sale) {
  y = drawSectionHeading(doc, y, COPY.pdf.saleHeading);
  if (sale.priceNegotiable && sale.payment !== 'gift') {
    y = drawRow(doc, y, 'Sale price:', '', { blank: true });
  } else if (sale.payment === 'gift') {
    y = drawRow(doc, y, 'Sale price:', 'Gift - no monetary consideration');
  } else {
    y = drawRow(doc, y, 'Sale price:', formatPrice(sale));
  }
  y = drawRow(doc, y, 'Date of sale:', formatDateLong(sale.date));
  y = drawRow(doc, y, 'Payment:', paymentLabel(sale));
  return y + SECTION_GAP;
}

function drawAck(doc, y, sale, vehicle, usState) {
  y = drawSectionHeading(doc, y, COPY.pdf.ackHeading);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  setColor(doc, INK);
  let body = sale.payment === 'gift' ? COPY.pdf.ackBodyGift : COPY.pdf.ackBody;

  // Federal odometer disclosure applies to motor vehicles regardless of
  // consideration (sale or gift). Vehicles older than the state's
  // odometer-disclosure threshold (post-2021 federal default: 20 model
  // years) drop the certification sentence.
  const vehicleYearNum = parseInt(vehicle?.year, 10);
  const currentYear = new Date().getFullYear();
  const ageYears = Number.isFinite(vehicleYearNum)
    ? (currentYear - vehicleYearNum)
    : 0;
  const threshold = Number.isFinite(usState?.odometerThresholdYears)
    ? usState.odometerThresholdYears
    : 20;
  const odoNeeded = vehicle?.type === 'motor' && ageYears <= threshold;
  if (odoNeeded && COPY.pdf.ackOdoCert) {
    body = String(body).trim() + ' ' + COPY.pdf.ackOdoCert;
  }

  const lines = doc.splitTextToSize(body, CONTENT_W - 14);
  lines.forEach((line, i) => {
    doc.text(line, BODY_INDENT, y + i * ACK_LINE_H);
  });
  return y + lines.length * ACK_LINE_H + SECTION_GAP;
}

function drawNotary(doc, y, usState) {
  // usState reserved for future per-state notary copy variants (e.g.
  // "Acknowledged before me on..." vs jurat). For v1 the body is generic.
  void usState;
  const heading = COPY.pdf.notaryHeading || 'NOTARIZATION';
  const rows = COPY.pdf.notaryRows || {
    stateCounty: 'State & County:',
    date: 'Date:',
    notarySig: 'Notary signature:',
    commission: 'Commission expires:',
  };
  y = drawSectionHeading(doc, y, heading);
  const opts = { blank: true, labelW: NOTARY_LABEL_W };
  y = drawRow(doc, y, rows.stateCounty, '', opts);
  y = drawRow(doc, y, rows.date, '', opts);
  y = drawRow(doc, y, rows.notarySig, '', opts);
  y = drawRow(doc, y, rows.commission, '', opts);
  return y + SECTION_GAP;
}

function drawSignatures(doc, y) {
  y = drawSectionHeading(doc, y, COPY.pdf.signaturesHeading);

  const sigLineW = 280;
  const dateLineW = 110;
  const lineGap = 16;          // gap between signature line and date line
  const sigSpace = 30;         // vertical space above the line for handwriting
  const labelOffset = 11;      // distance from line down to label baseline
  const blockGap = 24;         // gap between Seller and Buyer blocks

  function block(lineY, partyLabel) {
    setStroke(doc, INK);
    doc.setLineWidth(0.6);
    doc.line(BODY_INDENT, lineY, BODY_INDENT + sigLineW, lineY);
    const dateX = BODY_INDENT + sigLineW + lineGap;
    doc.line(dateX, lineY, dateX + dateLineW, lineY);

    doc.setFont('helvetica', 'normal').setFontSize(9);
    setColor(doc, MUTED);
    doc.text(partyLabel, BODY_INDENT, lineY + labelOffset);
    doc.text(COPY.pdf.dateLabel, dateX, lineY + labelOffset);
    setColor(doc, INK);
  }

  let lineY = y + sigSpace;
  block(lineY, COPY.pdf.sellerSignatureLabel);
  lineY += labelOffset + blockGap + sigSpace;
  block(lineY, COPY.pdf.buyerSignatureLabel);

  return lineY + labelOffset + SECTION_GAP;
}

function drawFooter(doc, usState) {
  const stamp = new Date().toLocaleString();
  const stateName = usState?.name || 'state';
  const formRef = usState?.bosFormName ? `(${usState.bosFormName}) ` : '';
  const dmvUrl = usState?.dmvUrl || '';
  const tail = dmvUrl ? ` ${dmvUrl}` : '';
  const text = `Generated ${stamp}. Not a substitute for ${stateName} ${formRef}DMV title transfer requirements.${tail}`;

  doc.setFont('helvetica', 'normal').setFontSize(8);
  setColor(doc, MUTED);

  const lines = doc.splitTextToSize(text, CONTENT_W);
  const lineH = 10;
  // Anchor the LAST line at PAGE_H - 36 so additional lines stack upward
  // and never run off the bottom of the page.
  const lastY = PAGE_H - 36;
  lines.forEach((line, i) => {
    const y = lastY - (lines.length - 1 - i) * lineH;
    doc.text(line, PAGE_W / 2, y, { align: 'center' });
  });
  setColor(doc, INK);
}

// ---- public entrypoint ----------------------------------------------------

export function buildBillOfSalePdf(state) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = MARGIN;

  const usState = getState(state.meta?.usState || 'VA');
  const subtitle = usState.honorific
    ? `${usState.honorific} of ${usState.name}`
    : usState.name;
  const includeNotary = state.sale?.includeNotary === true;

  // Title block
  doc.setFont('helvetica', 'bold').setFontSize(18);
  setColor(doc, INK);
  doc.text(COPY.pdf.title, MARGIN, y);
  y += 22;

  doc.setFont('helvetica', 'normal').setFontSize(11);
  setColor(doc, MUTED);
  doc.text(subtitle, MARGIN, y);
  setColor(doc, INK);
  doc.text(formatDateLong(state.sale.date), PAGE_W - MARGIN, y, { align: 'right' });
  y += 10;

  setStroke(doc, RULE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 24;

  y = drawParty(doc, y, COPY.pdf.sellerHeading, state.seller);
  y = drawParty(doc, y, COPY.pdf.buyerHeading, state.buyer);
  y = drawVehicle(doc, y, state.vehicle);
  y = drawSale(doc, y, state.sale);
  y = drawAck(doc, y, state.sale, state.vehicle, usState);

  // Reserve room for the optional notary block + signature block + footer;
  // if it won't fit, push to a new page and re-anchor.
  const SIG_BLOCK_HEIGHT = 14    // heading row
                         + 30    // top space for first line
                         + 11    // first label
                         + 24    // gap
                         + 30    // top space for second line
                         + 11    // second label
                         + SECTION_GAP;
  const NOTARY_BLOCK_HEIGHT = includeNotary
    ? (HEADING_GAP + 4 * BODY_LINE_H + SECTION_GAP)
    : 0;
  const FOOTER_RESERVE = 60;     // extra room if footer text wraps to 2-3 lines
  if (y + NOTARY_BLOCK_HEIGHT + SIG_BLOCK_HEIGHT > PAGE_H - FOOTER_RESERVE) {
    doc.addPage();
    y = MARGIN;
  }
  if (includeNotary) {
    y = drawNotary(doc, y, usState);
  }
  y = drawSignatures(doc, y);

  // Footer is anchored to the bottom of the current (last) page.
  drawFooter(doc, usState);

  return doc.output('blob');
}
