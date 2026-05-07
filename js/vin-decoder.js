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

// NHTSA BodyClass strings (lowercase) -> our subType keys.
const BODY_CLASS_MAP_MOTOR = {
  'sedan/saloon': 'sedan',
  'sedan': 'sedan',
  'sport utility vehicle (suv)/multi-purpose vehicle (mpv)': 'suv',
  'sport utility vehicle (suv)': 'suv',
  'multi-purpose vehicle (mpv)': 'suv',
  'pickup': 'truck',
  'pickup truck': 'truck',
  'truck': 'truck',
  'truck-tractor': 'truck',
  'van': 'van',
  'van (cargo)': 'van',
  'van (passenger)': 'van',
  'cargo van': 'van',
  'minivan': 'van',
  'coupe': 'coupe',
  'hatchback/liftback/notchback': 'coupe',
  'convertible/cabriolet': 'coupe',
  'motorcycle': 'motorcycle',
  'motorcycle - standard': 'motorcycle',
  'motorcycle - cruiser': 'motorcycle',
  'motorcycle - sport': 'motorcycle',
  'motorcycle - touring': 'motorcycle',
  'motorcycle - dual sport': 'motorcycle',
};

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
  'trailer': 'trailer',
};

function titleCase(s) {
  if (!s) return '';
  return String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function mapBodyClass(bodyClass, vehicleType) {
  if (!bodyClass) return null;
  const key = String(bodyClass).toLowerCase().trim();
  const map = vehicleType === 'trailer' ? BODY_CLASS_MAP_TRAILER : BODY_CLASS_MAP_MOTOR;
  return map[key] || null;
}

function mapVehicleType(vt) {
  if (!vt) return null;
  return VEHICLE_TYPE_MAP[String(vt).toLowerCase().trim()] || null;
}

export async function decodeVin(vin, vehicleType = 'motor') {
  if (!vin || vin.length !== 17) return null;
  const url = `${ENDPOINT}/${encodeURIComponent(vin)}?format=json`;
  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    data = json && Array.isArray(json.Results) ? json.Results[0] : null;
  } catch {
    return null;
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
  if (data.Model) out.model = titleCase(data.Model);
  if (data.BodyClass) {
    const sub = mapBodyClass(data.BodyClass, effectiveType);
    if (sub) {
      out.subType = sub;
      out.subTypeOther = '';
    } else {
      out.subType = 'other';
      out.subTypeOther = titleCase(data.BodyClass);
    }
  }

  return Object.keys(out).length === 0 ? null : out;
}
