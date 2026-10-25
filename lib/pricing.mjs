// Algoritmo di prezzo suggerito per notte.
// Combina: stagionalità di Siena, giorno della settimana, eventi e festività,
// ricerche fatte dai visitatori sul sito, occupazione del periodo e anticipo della prenotazione.
import { addDays, diffDays, parse, today } from "./dates.mjs";
import { eventsOn } from "./events.mjs";

const round5 = n => Math.round(n / 5) * 5;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/**
 * @param {string} date notte da valutare
 * @param {object} ctx { settings, blocked:Set<string>, searches:Map<string,number>, avgSearches:number, totalSearches:number, now?:string }
 * @returns {{ price:number, demand:number, factors:{label:string,pct:number}[], events:string[] }}
 */
export function suggestPrice(date, ctx) {
  const s = ctx.settings;
  const factors = [];
  let mult = 1;
  const apply = (label, f) => {
    if (Math.abs(f - 1) < 0.005) return;
    mult *= f;
    factors.push({ label, pct: Math.round((f - 1) * 100) });
  };

  const month = parse(date).getUTCMonth();
  const season = s.seasonality[month] ?? 1;
  apply(season >= 1.1 ? "Alta stagione" : season <= 0.85 ? "Bassa stagione" : "Stagionalità", season);

  const dow = parse(date).getUTCDay();
  if (dow === 5 || dow === 6) apply("Weekend", 1 + s.weekendUplift / 100);

  // Eventi: si applica il più forte, gli altri vengono solo citati.
  const evs = eventsOn(date, s.customEvents).sort((a, b) => b.uplift - a.uplift);
  if (evs.length) apply(evs[0].name, 1 + evs[0].uplift);

  // Ricerche sul sito per questa notte rispetto alla media (serve un minimo di dati).
  if (ctx.totalSearches >= 20) {
    const n = ctx.searches.get(date) || 0;
    const f = clamp(1 + 0.08 * Math.log2((n + 1) / (ctx.avgSearches + 1)), 0.92, 1.15);
    apply(f > 1 ? `Molto cercata sul sito (${n} ricerche)` : "Poche ricerche sul sito", f);
  }

  // Occupazione nei 3 giorni prima e dopo (anche da Airbnb e Booking).
  let busy = 0;
  for (let i = -3; i <= 3; i++) if (i && ctx.blocked.has(addDays(date, i))) busy++;
  if (busy >= 4) apply("Periodo molto richiesto", 1.1);

  // Notte isolata tra due prenotazioni: difficile da vendere col soggiorno minimo.
  if (s.minNights > 1 && ctx.blocked.has(addDays(date, -1)) && ctx.blocked.has(addDays(date, 1))) {
    apply("Notte isolata tra due prenotazioni", 0.85);
  }

  // Anticipo: se la data è vicina e ancora libera conviene abbassare.
  const lead = diffDays(ctx.now || today(), date);
  if (lead < 0) { /* data passata: nessun aggiustamento */ }
  else if (lead <= 3) apply("Ultimo minuto (≤ 3 giorni)", 0.85);
  else if (lead <= 10) apply("Data vicina ancora libera", 0.93);
  else if (lead > 150) apply("Molto in anticipo", 1.05);

  const price = clamp(round5(s.basePrice * mult), s.minPrice, s.maxPrice);
  return { price, demand: mult, factors, events: evs.map(e => e.name) };
}

// Prezzo effettivo pubblicato per una notte.
export function nightlyPrice(date, { settings, overrides, suggestion }) {
  if (overrides[date] != null) return overrides[date];
  if (settings.autoPricing) return suggestion.price;
  const dow = parse(date).getUTCDay();
  const weekend = dow === 5 || dow === 6;
  return round5(settings.basePrice * (weekend ? 1 + settings.weekendUplift / 100 : 1));
}
