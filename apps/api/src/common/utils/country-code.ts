const COUNTRY_CODES: Record<string, string> = {
  australia: "AU",
  austria: "AT",
  belgium: "BE",
  brazil: "BR",
  canada: "CA",
  china: "CN",
  croatia: "HR",
  "czech republic": "CZ",
  denmark: "DK",
  finland: "FI",
  france: "FR",
  germany: "DE",
  greece: "GR",
  hungary: "HU",
  iceland: "IS",
  india: "IN",
  ireland: "IE",
  italy: "IT",
  japan: "JP",
  mexico: "MX",
  netherlands: "NL",
  "new zealand": "NZ",
  norway: "NO",
  poland: "PL",
  portugal: "PT",
  spain: "ES",
  sweden: "SE",
  switzerland: "CH",
  turkey: "TR",
  "united kingdom": "GB",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
};

/** Returns a two-letter code for the country names the legacy form accepts. */
export function countryCodeFor(country: string): string {
  const key = country.trim().toLowerCase();
  return COUNTRY_CODES[key] ?? "ZZ";
}
