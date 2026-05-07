// js/storage.js
//
// localStorage persistence for the wizard's draft state.
// Schema version: 1. Bump KEY suffix or `meta.version` if the shape changes.
//
// Public API:
//   defaultState()        -> a fresh state object
//   loadState(default)    -> persisted state or a clone of `default`
//   saveState(state)      -> writes state under KEY, stamps meta.updatedAt
//   clearState()          -> removes the key

const KEY = 'va-bill-of-sale:draft:v1';

export function defaultState() {
  return {
    vehicle: {
      type: 'motor',
      year: '',
      make: '',
      model: '',
      color: '',
      subType: '',
      subTypeOther: '',
      vin: '',
      hin: '',
      length: '',
      hullMaterial: '',
      odometer: '',
      odometerUnit: 'miles',
      odometerStatus: 'actual',
    },
    seller: {
      name: '', street: '', city: '', state: 'VA', zip: '', phone: '', license: '',
    },
    buyer: {
      name: '', street: '', city: '', state: 'VA', zip: '', phone: '', license: '',
    },
    sale: {
      price: '',
      date: new Date().toISOString().slice(0, 10),
      payment: 'cash',
      paymentOther: '',
      asIsAck: false,
    },
    meta: {
      version: 1,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function loadState(fallback) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    if (parsed?.meta?.version !== 1) return structuredClone(fallback);
    return parsed;
  } catch {
    return structuredClone(fallback);
  }
}

export function saveState(state) {
  state.meta = { version: 1, updatedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    // Quota or disabled storage. Non-fatal: the form keeps working in-memory.
    console.warn('saveState failed:', err);
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.warn('clearState failed:', err);
  }
}
