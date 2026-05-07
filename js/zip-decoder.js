// js/zip-decoder.js
//
// US ZIP -> {city, state} lookup via api.zippopotam.us.
// Public, free, no key, CORS-enabled.
// Endpoint: https://api.zippopotam.us/us/{zip}
//
//   decodeZip(zip) -> Promise<null | { city: string, state: string }>
//
// Accepts a 5-digit ZIP or 5+4 (the +4 is stripped). Returns null for any
// non-match input, network failure, parse failure, or 404. Caller uses null
// as "couldn't decode" and leaves the user's fields alone.

const ENDPOINT = 'https://api.zippopotam.us/us';
const TIMEOUT_MS = 4000;

// In-memory cache keyed by 5-digit ZIP. Same draft session avoids re-fetching
// when a user blurs the same ZIP twice.
const cache = new Map();

export async function decodeZip(input) {
  if (!input) return null;
  const m = String(input).trim().match(/^(\d{5})(?:-\d{4})?$/);
  if (!m) return null;
  const zip = m[1];

  if (cache.has(zip)) return cache.get(zip);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let result = null;
  try {
    const res = await fetch(`${ENDPOINT}/${zip}`, { signal: ctrl.signal });
    if (res.ok) {
      const json = await res.json();
      const place = Array.isArray(json?.places) ? json.places[0] : null;
      const city = place?.['place name'];
      const state = place?.['state abbreviation'];
      if (city && state) result = { city: String(city), state: String(state) };
    }
  } catch {
    result = null;
  } finally {
    clearTimeout(timer);
  }

  cache.set(zip, result);
  return result;
}
