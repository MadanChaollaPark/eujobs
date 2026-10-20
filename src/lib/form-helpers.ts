/** Country for common EU-affairs cities, so employers only type the location. */
const CITY_COUNTRIES: Record<string, string> = {
  brussels: 'Belgium',
  bruxelles: 'Belgium',
  brussel: 'Belgium',
  antwerp: 'Belgium',
  ghent: 'Belgium',
  leuven: 'Belgium',
  luxembourg: 'Luxembourg',
  strasbourg: 'France',
  paris: 'France',
  lyon: 'France',
  geneva: 'Switzerland',
  genève: 'Switzerland',
  zurich: 'Switzerland',
  bern: 'Switzerland',
  'the hague': 'Netherlands',
  amsterdam: 'Netherlands',
  rotterdam: 'Netherlands',
  vienna: 'Austria',
  berlin: 'Germany',
  munich: 'Germany',
  frankfurt: 'Germany',
  bonn: 'Germany',
  hamburg: 'Germany',
  darmstadt: 'Germany',
  heidelberg: 'Germany',
  london: 'United Kingdom',
  dublin: 'Ireland',
  madrid: 'Spain',
  barcelona: 'Spain',
  lisbon: 'Portugal',
  rome: 'Italy',
  milan: 'Italy',
  florence: 'Italy',
  warsaw: 'Poland',
  prague: 'Czechia',
  budapest: 'Hungary',
  athens: 'Greece',
  copenhagen: 'Denmark',
  stockholm: 'Sweden',
  helsinki: 'Finland',
  oslo: 'Norway',
  tallinn: 'Estonia',
  riga: 'Latvia',
  vilnius: 'Lithuania',
  bratislava: 'Slovakia',
  ljubljana: 'Slovenia',
  zagreb: 'Croatia',
  sofia: 'Bulgaria',
  bucharest: 'Romania',
  valletta: 'Malta',
  nicosia: 'Cyprus',
  parma: 'Italy',
  alicante: 'Spain',
  angers: 'France',
};
export function countryFromLocation(location: string, fallback?: string | null) {
  const value = location.trim().toLowerCase();
  if (CITY_COUNTRIES[value]) return CITY_COUNTRIES[value];
  for (const part of value.split(/[,;/()]|\s+or\s+/).map((p) => p.trim()))
    if (CITY_COUNTRIES[part]) return CITY_COUNTRIES[part];
  const known = Object.values(CITY_COUNTRIES).find((country) =>
    value.split(/[,;/()]/).some((p) => p.trim() === country.toLowerCase()),
  );
  if (known) return known;
  return fallback && fallback.trim().length >= 2 ? fallback.trim() : 'Not specified';
}
/** Card text: the employer's intro when long enough, otherwise taken from the description. */
export function deriveSummary(summary: string, description: string) {
  const intro = summary.trim();
  if (intro.length >= 20) return intro.slice(0, 300);
  const text = `${intro ? `${intro} — ` : ''}${description.trim().replace(/\s+/g, ' ')}`;
  if (text.length <= 300) return text;
  const cut = text.slice(0, 297);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 200))}…`;
}
