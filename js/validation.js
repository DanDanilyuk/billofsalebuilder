// js/validation.js
//
// Pure validators. Each returns either null (valid) or a string error code
// that maps to a key in COPY.errors. Required-field handling lives in app.js
// (it inspects field.req before delegating here).

export const validators = {
  required: (v) => (v === '' || v == null || v === false) ? 'required' : null,

  // VIN: 17 chars, A-Z and 0-9, excluding I, O, Q.
  vin: (v) => {
    if (typeof v !== 'string') return 'vin';
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(v.toUpperCase()) ? null : 'vin';
  },

  // HIN: 12 chars, A-Z and 0-9.
  hin: (v) => {
    if (typeof v !== 'string') return 'hin';
    return /^[A-Z0-9]{12}$/.test(v.toUpperCase()) ? null : 'hin';
  },

  year: (v) => {
    const n = parseInt(v, 10);
    const max = new Date().getFullYear() + 1;
    return (Number.isInteger(n) && String(n) === String(v).trim() && n >= 1900 && n <= max)
      ? null
      : 'year';
  },

  zip: (v) => /^\d{5}(-\d{4})?$/.test(String(v).trim()) ? null : 'zip',

  // Two-letter US state abbreviation (uppercase). The wizard's searchSelect
  // commits values from STATES, but a validator backstops manual edits.
  usState: (v) => /^[A-Z]{2}$/.test(String(v ?? '').trim()) ? null : 'usState',

  price: (v) => {
    const n = Number(v);
    return (Number.isFinite(n) && n >= 0 && n < 1e8) ? null : 'price';
  },

  // Odometer: whole miles/km, zero or more. Rejects negatives, non-numbers,
  // and fractional readings.
  odometer: (v) => {
    const n = Number(v);
    return (Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n < 1e9)
      ? null
      : 'odometer';
  },

  // Length in feet, zero or more. Decimals allowed (e.g. 24.5).
  length: (v) => {
    const n = Number(v);
    return (Number.isFinite(n) && n >= 0 && n < 1e7) ? null : 'length';
  },

  date: (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
    const d = new Date(v + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return 'date';
    // Cutoff is the end of TODAY (local): "Sale date can't be in the future"
    // means tomorrow fails. The input parses at noon local, so any date up to
    // and including today lands below this.
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return d > endOfToday ? 'dateFuture' : null;
  },

  // Phone is optional; empty passes. If present, must be 10 digits after
  // stripping non-digits.
  phoneOptional: (v) => {
    const s = String(v ?? '').trim();
    if (s === '') return null;
    return /^\d{10}$/.test(s.replace(/\D/g, '')) ? null : 'phone';
  },
};

// Pure display formatter (NOT a validator): renders a complete 10-digit phone
// as (xxx) xxx-xxxx. Partial or non-10-digit input is returned trimmed and
// otherwise untouched so phoneOptional can still flag it. Used on blur in app.js
// and when printing the PDF.
export function formatPhone(v) {
  const digits = String(v ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return String(v ?? '').trim();
}
