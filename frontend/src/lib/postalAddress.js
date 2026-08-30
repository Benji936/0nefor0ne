/**
 * A shop's address, printed the way its own country prints it.
 *
 * Every seeded community carries the street line, postcode and state that
 * Konami publishes for it (see 20260822_community_street_address.sql). Getting
 * them onto the page means composing three or four fields into lines, and the
 * order of those lines is not universal: Ulm writes "89073 Ulm", Amsterdam NY
 * writes "Amsterdam, NY 12010", and Oita writes the postcode first and then
 * works downward from the prefecture to the ward.
 *
 * Three conventions cover the corpus: the United States and Japan alone are
 * 2,894 of the 4,451 rows on file, and continental Europe another 850. Anywhere
 * else falls through to city-then-postcode, which is what the English-speaking
 * world outside North America does and is at worst readable everywhere else.
 */

/**
 * Countries that lead the locality line with the postcode: "89073 Ulm".
 * Continental Europe, near enough, plus the handful elsewhere that follow it.
 */
const POSTCODE_FIRST = new Set([
  "AT", "BA", "BE", "BG", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HR", "HU", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "NO",
  "PL", "PT", "RO", "RS", "SE", "SI", "SK", "TR", "UY",
]);

/**
 * Countries that write an address large-to-small: postcode, then the province,
 * then the city. Japan is 948 rows of the directory, so this is not an edge
 * case dressed up as one.
 */
const LARGE_TO_SMALL = new Set(["JP", "KR", "CN", "TW", "HK", "MO"]);

/** Countries that put the state between the city and the postcode. */
const STATE_INLINE = new Set(["US", "CA", "AU", "NZ", "BR", "MX", "MY", "IN"]);

const clean = (v) => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

/**
 * The locality line: the one that carries the city, and the postcode and state
 * where the country uses them. Returns null when there is nothing to say.
 */
function localityLine(code, { city, state, postal }) {
  if (LARGE_TO_SMALL.has(code)) {
    return [postal, state, city].filter(Boolean).join(" ") || null;
  }
  if (POSTCODE_FIRST.has(code)) {
    // The state is dropped rather than guessed at a position: these countries
    // do not print one, and the source fills it with a region name that would
    // read as a second town sitting next to the first.
    return [postal, city].filter(Boolean).join(" ") || null;
  }
  if (STATE_INLINE.has(code) && city && state) {
    return [`${city}, ${state}`, postal].filter(Boolean).join(" ");
  }
  // London EC1A 1BB, Singapore 550548: the town, then the code, separated by a
  // space and never by a comma — a comma there reads as another place name.
  const head = [city, state].filter(Boolean).join(", ");
  return [head, postal].filter(Boolean).join(" ") || null;
}

/**
 * The address as printed lines, street first and country last.
 *
 * Lines rather than one string, because the caller sets them in a monospace
 * block where each fact gets its own row — an address is an identifier, and
 * this app already reads identifiers in mono (DESIGN.md, The Mono Identifier
 * Rule). Returns [] when the row has nothing beyond a country, which is the
 * signal to draw no address block at all rather than one that says "Japan".
 */
export function addressLines(community) {
  const c = community ?? {};
  const code = String(c.country_code ?? "").toUpperCase();
  const street = clean(c.address);
  const locality = localityLine(code, {
    city: clean(c.city),
    state: clean(c.state),
    postal: clean(c.postal_code),
  });
  const country = clean(c.country);
  // A lone country name is the row saying "somewhere in Japan". That is the
  // directory's business, not an address, so it is not printed as one.
  if (!street && !locality) return [];
  return [street, locality, country].filter(Boolean);
}

/**
 * A dialable href, or null.
 *
 * The source writes numbers however the shop gave them — "(863) 209-4093",
 * "4506280027", "+41 22 310 12 34" — so the label keeps whatever was written
 * and only the href is normalised. Everything but digits and a leading plus is
 * dropped; a number with fewer than five digits left is a fragment, not a
 * phone, and gets no link rather than a link that dials nothing.
 */
export function telHref(phone) {
  const raw = clean(phone);
  if (!raw) return null;
  const plus = raw.trimStart().startsWith("+") ? "+" : "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 5 ? `tel:${plus}${digits}` : null;
}

/**
 * Where "Directions" goes.
 *
 * Coordinates when the row has them — 4,444 of 4,451 do, and a pin cannot be
 * misread the way a street name can. Otherwise the printed address as a search
 * query, which is still better than dropping the reader in the middle of a
 * city. Null when there is neither.
 */
export function directionsUrl(community) {
  const c = community ?? {};
  if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
  }
  const query = [clean(c.name), ...addressLines(c)].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

/**
 * schema.org PostalAddress for the profile's LocalBusiness block.
 *
 * Until now this page emitted addressLocality and addressCountry and nothing
 * else, which is a business card with the street torn off: Google's local
 * results want streetAddress and postalCode, and 4,343 of these pages can now
 * give both. Returns undefined when there is nothing worth emitting, so the
 * caller can spread it conditionally.
 */
export function postalAddressLd(community) {
  const c = community ?? {};
  const parts = {
    streetAddress: clean(c.address),
    addressLocality: clean(c.city),
    addressRegion: clean(c.state),
    postalCode: clean(c.postal_code),
    addressCountry: clean(c.country_code) || clean(c.country),
  };
  const present = Object.fromEntries(Object.entries(parts).filter(([, v]) => v));
  return Object.keys(present).length > 0 ? { "@type": "PostalAddress", ...present } : undefined;
}
