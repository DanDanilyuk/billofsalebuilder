// js/vin-decoder.js
//
// VIN decoding via NHTSA vPIC API. Public, free, no key, CORS-enabled.
// Endpoint: https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/{VIN}?format=json
//
//   decodeVin(vin, vehicleType) -> Promise<null | {
//     type?: 'motor' | 'trailer',  // mapped from VehicleType
//     year?: string,
//     make?: string,
//     model?: string,
//     subType?: string,            // mapped enum from BodyClass
//     subTypeOther?: string,       // populated when no enum match
//   }>
//
// `vehicleType` is the caller's current type (used to pick the right
// BodyClass mapping). The decoded result MAY override type via the `type`
// field if NHTSA's VehicleType disagrees with the caller's guess.
//
// Returns null on network failure, parse failure, or empty result. Caller
// treats null as "couldn't decode" and falls back to manual entry.

const ENDPOINT = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues';
// Abort a stalled vPIC request after 4s (mirrors zip-decoder) so the
// "Decoding VIN..." hint can't hang for minutes on a dead connection.
const TIMEOUT_MS = 4000;

// NHTSA BodyClass -> our subType keys, matched by keyword against the
// lowercased string. NHTSA rewords these labels from time to time ("(SUV)"
// became "[SUV]", "Multi-Purpose" became "Multipurpose", the motorcycle list
// grew), which silently broke an exact-string table and sent every SUV to
// "Other". Matching the stable part of the label survives that. First hit
// wins; anything unmatched (Wagon, Bus, "Sport Utility Truck [SUT]", the
// Off-Road and Incomplete families) falls through to "Other" with NHTSA's
// own label.
const BODY_CLASS_RULES_MOTOR = [
  [/^motorcycle\b/, 'motorcycle'],
  [/sport utility vehicle|crossover utility|multi-?purpose vehicle/, 'suv'],
  [/^(pickup|truck)\b/, 'truck'],
  [/\b(mini)?van\b/, 'van'],
  [/\bsedan\b/, 'sedan'],
  [/\b(coupe|hatchback|convertible)\b/, 'coupe'],
];

const BODY_CLASS_MAP_TRAILER = {
  'utility trailer': 'utility',
  'cargo trailer': 'cargo',
  'boat trailer': 'boatTrailer',
  'travel trailer': 'utility',
  'trailer': 'utility',
};

// NHTSA VehicleType -> our `vehicle.type` enum. Boats aren't covered
// (they use HIN, not VIN). Anything not listed returns null and we leave
// the user's chosen type alone.
const VEHICLE_TYPE_MAP = {
  'passenger car': 'motor',
  'truck': 'motor',
  'multipurpose passenger vehicle (mpv)': 'motor',
  'motorcycle': 'motor',
  'bus': 'motor',
  'incomplete vehicle': 'motor',
  'low speed vehicle (lsv)': 'motor',
  'off road vehicle': 'motor',
  'off-road vehicle': 'motor', // NHTSA's current spelling
  'trailer': 'trailer',
};

// For the Make only: NHTSA reports makes in ALL CAPS ("HONDA"). Model and
// BodyClass arrive already cased the way the manufacturer writes them.
function titleCase(s) {
  if (!s) return '';
  // Keep short all-caps tokens as-is: NHTSA reports acronym makes in caps
  // (BMW, GMC, RAM) and "Bmw" on a legal document reads wrong.
  return String(s)
    .split(' ')
    .map((w) => /^[A-Z0-9]{2,3}$/.test(w)
      ? w
      : w.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()))
    .join(' ');
}

function mapBodyClass(bodyClass, vehicleType) {
  if (!bodyClass) return null;
  const key = String(bodyClass).toLowerCase().trim();
  if (vehicleType === 'trailer') return BODY_CLASS_MAP_TRAILER[key] || null;
  const rule = BODY_CLASS_RULES_MOTOR.find(([pattern]) => pattern.test(key));
  return rule ? rule[1] : null;
}

function mapVehicleType(vt) {
  if (!vt) return null;
  return VEHICLE_TYPE_MAP[String(vt).toLowerCase().trim()] || null;
}

export async function decodeVin(vin, vehicleType = 'motor') {
  if (!vin || vin.length !== 17) return null;
  const url = `${ENDPOINT}/${encodeURIComponent(vin)}?format=json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let data;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    data = json && Array.isArray(json.Results) ? json.Results[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!data) return null;

  const out = {};

  // Detect the type first - it changes which body-class map we use, and the
  // caller may want to flip the form's vehicle.type radio.
  const detectedType = mapVehicleType(data.VehicleType);
  if (detectedType) out.type = detectedType;
  // Effective type for body-class lookup: prefer detected, fall back to caller.
  const effectiveType = detectedType || vehicleType;

  if (data.ModelYear) out.year = String(data.ModelYear).trim();
  if (data.Make) out.make = titleCase(data.Make);
  // Model is kept verbatim: title-casing it turned "CR-V" into "Cr-V", "RAV4"
  // into "Rav4" and "4Runner" into "4runner".
  if (data.Model) out.model = String(data.Model).trim();
  if (data.BodyClass) {
    const sub = mapBodyClass(data.BodyClass, effectiveType);
    if (sub) {
      out.subType = sub;
      out.subTypeOther = '';
    } else {
      out.subType = 'other';
      // Verbatim for the same reason ("[SUT]" must not become "[Sut]").
      out.subTypeOther = String(data.BodyClass).trim();
    }
  }

  return Object.keys(out).length === 0 ? null : out;
}
