// js/pdf.js
//
// Builds a Virginia Vehicle Bill of Sale PDF using jsPDF (vendored at
// lib/jspdf.umd.min.js, exposed on window.jspdf). Helvetica + Courier
// only (no custom font embedding for v1).
//
// Public API:
//   buildBillOfSalePdf(state) -> Blob
//
// Reads from the shared state schema documented in
// docs/superpowers/plans/2026-05-07-va-bill-of-sale.md ("Shared contract").

import { COPY } from './copy.js';

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
const LABEL_W = 86;           // width of inline labels like "Address:"
const VALUE_W = CONTENT_W - 14 - LABEL_W;

// Static lookups.
const TYPE_LABEL = { motor: 'Motor vehicle', trailer: 'Trailer', boat: 'Boat' };
const ODO_STATUS = {
  actual: 'Reflects actual mileage',
  not_actual: 'Does not reflect actual mileage',
  exceeds: 'Exceeds mechanical limits',
};

// ---- helpers --------------------------------------------------------------

function setColor(doc, rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setStroke(doc, rgb) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function subTypeLabel(vehicle) {
  if (!vehicle.subType) return '';
  if (vehicle.subType === 'other') {
    return vehicle.subTypeOther?.trim() || 'Other';
  }
  const map = COPY.step1?.subType?.[vehicle.type] || {};
  return map[vehicle.subType] || vehicle.subType;
}

function hullMaterialLabel(key) {
  if (!key) return '';
  const opts = COPY.step1?.hullMaterial?.options || {};
  return opts[key] || key;
}

function paymentLabel(sale) {
  if (sale.payment === 'other') {
    return sale.paymentOther?.trim() || 'Other';
  }
  const opts = COPY.step4?.payment?.options || {};
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
//   opts.mono: true   - render the value in Courier (used for VIN/HIN)
//   opts.blank: true  - draw a horizontal underline at the value column
//                       instead of text (used when a section is left blank
//                       for handwriting)
function drawRow(doc, y, label, value, opts = {}) {
  const text = value == null ? '' : String(value);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  setColor(doc, MUTED);
  doc.text(label, BODY_INDENT, y);

  const valueX = BODY_INDENT + LABEL_W;

  if (opts.blank) {
    setStroke(doc, INK);
    doc.setLineWidth(0.5);
    // Sit the line slightly below the label baseline so it reads as a
    // writing line, not a strikethrough.
    doc.line(valueX, y + 2, valueX + VALUE_W, y + 2);
    return y + BODY_LINE_H;
  }

  if (opts.mono) {
    doc.setFont('courier', 'normal').setFontSize(10);
  } else {
    doc.setFont('helvetica', 'normal').setFontSize(10);
  }
  setColor(doc, INK);

  const lines = text === '' ? [''] : doc.splitTextToSize(text, VALUE_W);
  lines.forEach((line, i) => {
    doc.text(line, valueX, y + i * BODY_LINE_H);
  });
  return y + Math.max(1, lines.length) * BODY_LINE_H;
}

// ---- section drawers ------------------------------------------------------

function drawParty(doc, y, heading, party) {
  y = drawSectionHeading(doc, y, heading);
  // skipFill renders blank lines for handwriting and omits Phone / DL-ID
  // (those rows are optional anyway).
  if (party && party.skipFill) {
    y = drawRow(doc, y, 'Name:', '', { blank: true });
    y = drawRow(doc, y, 'Address:', '', { blank: true });
    return y + SECTION_GAP;
  }
  y = drawRow(doc, y, 'Name:', party.name);
  const addr = [party.street, party.city, party.state, party.zip]
    .map(s => (s == null ? '' : String(s).trim()))
    .filter(Boolean);
  // Format as "123 Main St, Richmond, VA 23220"
  const cityStateZip = [
    party.city?.trim() || '',
    [party.state?.trim() || '', party.zip?.trim() || ''].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const addressLine = [party.street?.trim() || '', cityStateZip]
    .filter(Boolean).join(', ');
  y = drawRow(doc, y, 'Address:', addressLine || addr.join(', '));
  if (party.phone && String(party.phone).trim()) {
    y = drawRow(doc, y, 'Phone:', party.phone);
  }
  if (party.license && String(party.license).trim()) {
    y = drawRow(doc, y, 'DL/ID:', party.license);
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

function drawAck(doc, y, sale, vehicle) {
  y = drawSectionHeading(doc, y, COPY.pdf.ackHeading);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  setColor(doc, INK);
  let body = sale.payment === 'gift' ? COPY.pdf.ackBodyGift : COPY.pdf.ackBody;
  // Federal odometer disclosure applies to motor vehicles regardless of
  // consideration (sale or gift), so append the certification sentence on
  // motor PDFs only. Guarded so a missing copy key is non-fatal.
  if (vehicle?.type === 'motor' && COPY.pdf.ackOdoCert) {
    body = String(body).trim() + ' ' + COPY.pdf.ackOdoCert;
  }
  const lines = doc.splitTextToSize(body, CONTENT_W - 14);
  lines.forEach((line, i) => {
    doc.text(line, BODY_INDENT, y + i * ACK_LINE_H);
  });
  return y + lines.length * ACK_LINE_H + SECTION_GAP;
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

function drawFooter(doc) {
  const stamp = new Date().toLocaleString();
  const text = (COPY.pdf.footerDisclaimer || '').replace('{timestamp}', stamp);
  doc.setFont('helvetica', 'normal').setFontSize(8);
  setColor(doc, MUTED);
  doc.text(text, PAGE_W / 2, PAGE_H - 36, { align: 'center' });
  setColor(doc, INK);
}

// ---- public entrypoint ----------------------------------------------------

export function buildBillOfSalePdf(state) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = MARGIN;

  // Title block
  doc.setFont('helvetica', 'bold').setFontSize(18);
  setColor(doc, INK);
  doc.text(COPY.pdf.title, MARGIN, y);
  y += 22;

  doc.setFont('helvetica', 'normal').setFontSize(11);
  setColor(doc, MUTED);
  doc.text(COPY.pdf.subtitle, MARGIN, y);
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
  y = drawAck(doc, y, state.sale, state.vehicle);

  // Reserve room for the signature block + footer; if it won't fit, push to
  // a new page and re-anchor.
  const SIG_BLOCK_HEIGHT = 14    // heading row
                         + 30    // top space for first line
                         + 11    // first label
                         + 24    // gap
                         + 30    // top space for second line
                         + 11    // second label
                         + SECTION_GAP;
  const FOOTER_RESERVE = 60;
  if (y + SIG_BLOCK_HEIGHT > PAGE_H - FOOTER_RESERVE) {
    doc.addPage();
    y = MARGIN;
  }
  y = drawSignatures(doc, y);

  // Footer is anchored to the bottom of the current (last) page.
  drawFooter(doc);

  return doc.output('blob');
}
