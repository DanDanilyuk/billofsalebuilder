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
//     subType?: string,            // mapped enum from BodyClass, or from
//                                  // TrailerBodyType for a trailer
//     subTypeOther?: string,       // populated when no enum match
//   }>
//
// `vehicleType` is the caller's current type (used to pick the right
// body mapping). The decoded result MAY override type via the `type`
// field if NHTSA's VehicleType disagrees with the caller's guess. Both
// subType fields are absent when NHTSA does not describe the body, which
// is the normal case for a trailer with no TrailerBodyType.
//
// Returns null on network failure, parse failure, or empty result. Caller
// treats null as "couldn't decode" and falls back to manual entry.
//
//   applyVinDecode(vehicle, decoded) -> void
//
// Pure (no DOM, no fetch). Merges a decodeVin() result, or null for a failed
// lookup, into `state.vehicle` without destroying what the user typed. It
// tracks its own writes in `vehicle.vinAutofill`; VIN_DECODE_FIELDS lists
// the fields it manages.

const ENDPOINT = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues';
// Abort a stalled vPIC request after 4s (mirrors zip-decoder) so the
// "Decoding VIN..." hint can't hang for minutes on a dead connection.
const TIMEOUT_MS = 4000;

// NHTSA BodyClass -> our subType keys, matched by keyword against the
// lowercased string. NHTSA rewords these labels from time to time ("(SUV)"
// became "[SUV]", "Multi-Purpose" became "Multipurpose", the motorcycle list
// grew), which silently broke an exact-string table and sent every SUV to
// "Other". Matching the stable part of the label survives that. First hit
// wins; anything unmatched (Roadster, Bus, "Sport Utility Truck [SUT]", the
// Off-Road and Incomplete families) falls through to "Other" with NHTSA's
// own label.
//
// Hatchback, convertible and wagon each get their own key. They used to be
// folded into "coupe" (or dropped to "Other"), which printed the wrong body
// style on a legal document.
const BODY_CLASS_RULES_MOTOR = [
  [/^motorcycle\b/, 'motorcycle'],
  [/sport utility vehicle|crossover utility|multi-?purpose vehicle/, 'suv'],
  [/^(pickup|truck)\b/, 'truck'],
  [/\b(mini)?van\b/, 'van'],
  [/\bsedan\b/, 'sedan'],
  [/\bhatchback\b/, 'hatchback'],
  [/\b(convertible|cabriolet)\b/, 'convertible'],
  [/\bwagon\b/, 'wagon'],
  [/\bcoupe\b/, 'coupe'],
];

// Trailers are the odd one out: NHTSA sets BodyClass to the bare word
// "Trailer" (or leaves it empty) for every one of them and reports the real
// kind in a separate field, TrailerBodyType ("Boat Trailer", "Car Hauler
// Trailer", ...). Only three of its ~30 values correspond to an option we
// offer; the rest fall through to "Other" with NHTSA's own label, same as
// motor vehicles. Keyword matching for the same reason as above.
const TRAILER_BODY_RULES = [
  [/\bboat\b/, 'boatTrailer'],
  [/\b(enclosed|cargo)\b/, 'cargo'], // "Box or Van Enclosed Trailer"
  [/\butility\b/, 'utility'],
];

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

// The NHTSA text that describes the body, or '' when it does not say.
//
// For a trailer an empty answer is deliberate. The generic "Trailer" used to
// be mapped to "utility", so boat trailers, car haulers and horse trailers
// all decoded as "Utility". When NHTSA does not name the kind we must not
// guess one: the caller leaves the dropdown for the user.
function bodyLabel(data, vehicleType) {
  const bodyClass = String(data.BodyClass || '').trim();
  if (vehicleType !== 'trailer') return bodyClass;
  const trailerBody = String(data.TrailerBodyType || '').trim();
  // Two values name no kind at all and are treated as empty. "Not Applicable"
  // is NHTSA's filler in this field for non-trailers; it can reach here when
  // the caller's type is 'trailer' but the VIN is not one. "Other Trailer"
  // would only pre-fill the description with the words "Other Trailer".
  if (trailerBody && !/^(not applicable|other trailer)$/i.test(trailerBody)) return trailerBody;
  return /^trailer$/i.test(bodyClass) ? '' : bodyClass;
}

function mapBodyClass(label, vehicleType) {
  if (!label) return null;
  const key = String(label).toLowerCase().trim();
  const rules = vehicleType === 'trailer' ? TRAILER_BODY_RULES : BODY_CLASS_RULES_MOTOR;
  const rule = rules.find(([pattern]) => pattern.test(key));
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
  const body = bodyLabel(data, effectiveType);
  if (body) {
    const sub = mapBodyClass(body, effectiveType);
    if (sub) {
      out.subType = sub;
      out.subTypeOther = '';
    } else {
      out.subType = 'other';
      // Verbatim for the same reason ("[SUT]" must not become "[Sut]").
      out.subTypeOther = body;
    }
  }

  return Object.keys(out).length === 0 ? null : out;
}

export const VIN_DECODE_FIELDS = ['year', 'make', 'model', 'subType', 'subTypeOther'];

// Two things must both hold when a VIN changes and gets decoded again:
//   1. Output of the PREVIOUS VIN's decode must not stick around. A Civic's
//      year/make/model next to a corrected VIN is wrong data on a legal form.
//   2. Anything the user typed by hand must survive. The failure hint tells
//      them to fill the details in manually; fixing one VIN character after
//      that used to wipe all of it.
// Blanking every field the lookup did not supply satisfies 1 and breaks 2.
// Never blanking satisfies 2 and breaks 1. So remember what the last decode
// wrote (`vehicle.vinAutofill`) and only clear a field that still holds
// exactly that value - if it differs, the user edited it and it is theirs.
//
// decodeVin() returns subTypeOther: '' when it maps a body class. The empty
// string counts as "not supplied" here on purpose: that is what clears a
// stale "Other" description left by the previous VIN.
export function applyVinDecode(vehicle, decoded) {
  // Drafts saved before vinAutofill existed have no such key.
  const previous = vehicle.vinAutofill || {};
  const wrote = {};
  // A failed decode says nothing about the type, so the user's choice stands.
  if (decoded && decoded.type != null) vehicle.type = decoded.type;
  for (const field of VIN_DECODE_FIELDS) {
    const value = decoded ? decoded[field] : null;
    if (value != null && value !== '') {
      vehicle[field] = value;
      wrote[field] = value;
    } else if (vehicle[field] && vehicle[field] === previous[field]) {
      vehicle[field] = '';
    }
  }
  vehicle.vinAutofill = wrote;
}
