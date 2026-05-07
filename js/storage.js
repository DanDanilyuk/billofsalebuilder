// js/storage.js
//
// localStorage persistence for the wizard's draft state.
// Schema version: 2. Bump KEY suffix or `meta.version` if the shape changes.
//
// Public API:
//   defaultState()        -> a fresh state object
//   loadState(default)    -> persisted state or a clone of `default`
//   saveState(state)      -> writes state under KEY, stamps meta.updatedAt
//   clearState()          -> removes the key

const KEY_V1 = 'va-bill-of-sale:draft:v1';
const KEY    = 'va-bill-of-sale:draft:v2';

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
      street: '', street2: '', city: '', state: 'VA', zip: '', phone: '', license: '',
      skipFill: false,
      // Joint-title support: when hasCoOwner is true, the form shows a second
      // set of fields for the co-owner and the PDF prints them.
      // coOwnerSameAddress mirrors the primary's address into the co-owner
      // row in the PDF and hides the redundant inputs.
      hasCoOwner: false,
      coOwnerSameAddress: false,
      coOwner: {
        firstName: '', middleName: '', lastName: '',
        street: '', street2: '', city: '', state: 'VA', zip: '', phone: '', license: '',
      },
    },
    buyer: {
      firstName: '', middleName: '', lastName: '',
      street: '', street2: '', city: '', state: 'VA', zip: '', phone: '', license: '',
      skipFill: false,
      hasCoOwner: false,
      coOwnerSameAddress: false,
      coOwner: {
        firstName: '', middleName: '', lastName: '',
        street: '', street2: '', city: '', state: 'VA', zip: '', phone: '', license: '',
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
      version: 2,
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
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.meta?.version === 2) return parsed;
    }
    // v1 -> v2 migration: roll forward existing draft data, infer VA + Seller.
    const v1Raw = localStorage.getItem(KEY_V1);
    if (v1Raw) {
      const v1 = JSON.parse(v1Raw);
      if (v1?.meta?.version === 1) {
        const migrated = structuredClone(fallback);
        for (const k of ['vehicle', 'seller', 'buyer', 'sale']) {
          if (v1[k]) Object.assign(migrated[k], v1[k]);
        }
        migrated.meta = {
          version: 2,
          usState: 'VA',
          role: 'seller',
          updatedAt: new Date().toISOString(),
        };
        try { localStorage.setItem(KEY, JSON.stringify(migrated)); } catch {}
        try { localStorage.removeItem(KEY_V1); } catch {}
        return migrated;
      }
    }
    return structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

export function saveState(state) {
  if (!state.meta) state.meta = {};
  state.meta.version = 2;
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
    localStorage.removeItem(KEY_V1);
  } catch (err) {
    console.warn('clearState failed:', err);
  }
}
