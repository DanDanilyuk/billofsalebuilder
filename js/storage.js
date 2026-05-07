// js/storage.js
//
// localStorage persistence for the wizard's draft state.
//
// Public API:
//   defaultState()        -> a fresh state object
//   loadState(default)    -> persisted state or a clone of `default`
//   saveState(state)      -> writes state under KEY, stamps meta.updatedAt
//   clearState()          -> removes the key

const KEY = 'billofsalebuilder:draft';

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
      firstName: '', middleName: '', lastName: '',
      street: '', street2: '', city: '', state: '', zip: '', phone: '', license: '',
      skipFill: false,
      // Joint-title support: when hasCoOwner is true, the form shows a second
      // set of fields for the co-owner and the PDF prints them.
      // coOwnerSameAddress mirrors the primary's address into the co-owner
      // row in the PDF and hides the redundant inputs.
      hasCoOwner: false,
      coOwnerSameAddress: false,
      coOwner: {
        firstName: '', middleName: '', lastName: '',
        street: '', street2: '', city: '', state: '', zip: '', phone: '', license: '',
      },
    },
    buyer: {
      firstName: '', middleName: '', lastName: '',
      street: '', street2: '', city: '', state: '', zip: '', phone: '', license: '',
      skipFill: false,
      hasCoOwner: false,
      coOwnerSameAddress: false,
      coOwner: {
        firstName: '', middleName: '', lastName: '',
        street: '', street2: '', city: '', state: '', zip: '', phone: '', license: '',
      },
    },
    sale: {
      price: '',
      date: new Date().toISOString().slice(0, 10),
      payment: 'cash',
      paymentOther: '',
      priceNegotiable: false,
      includeNotary: false,
      // Tracks whether the user has explicitly toggled the notary checkbox.
      // Once true, picking a different US state will not auto-flip the
      // includeNotary value.
      notaryUserSet: false,
    },
    meta: {
      // Empty until the user picks a state on Step 1; validators block
      // advancement and applyStateChrome() shows a neutral footer.
      usState: '',
      role: 'seller',
      updatedAt: new Date().toISOString(),
    },
  };
}

export function loadState(fallback) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    return structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

export function saveState(state) {
  if (!state.meta) state.meta = {};
  state.meta.updatedAt = new Date().toISOString();
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
