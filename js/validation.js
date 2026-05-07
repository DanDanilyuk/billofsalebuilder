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

  price: (v) => {
    const n = Number(v);
    return (Number.isFinite(n) && n >= 0 && n < 1e8) ? null : 'price';
  },

  date: (v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
    const d = new Date(v + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return 'date';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    return d > tomorrow ? 'dateFuture' : null;
  },

  // Phone is optional; empty passes. If present, must be 10 digits after
  // stripping non-digits.
  phoneOptional: (v) => {
    const s = String(v ?? '').trim();
    if (s === '') return null;
    return /^\d{10}$/.test(s.replace(/\D/g, '')) ? null : 'phone';
  },
};
