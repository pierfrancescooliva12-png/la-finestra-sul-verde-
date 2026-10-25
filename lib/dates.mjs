// Date gestite come stringhe "YYYY-MM-DD" in UTC, per evitare problemi di fuso orario.
export const DAY = 86400000;

export const parse = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const iso = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * DAY));
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
export const today = () => iso(new Date());
export const isDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;

// Elenco delle notti tra check-in (incluso) e check-out (escluso).
export function nights(from, to) {
  const out = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}
