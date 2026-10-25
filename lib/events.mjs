// Calendario della domanda a Siena: eventi e festività che fanno salire le richieste.
// "uplift" è l'aumento suggerito (0.3 = +30%). Le date "from"/"to" sono notti incluse.
import { iso, addDays } from "./dates.mjs";

// Domenica di Pasqua (algoritmo gregoriano anonimo).
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(Date.UTC(y, month - 1, day)));
}

// Strade Bianche: sabato all'inizio di marzo (primo sabato dal 2 marzo in poi).
function stradeBianche(y) {
  const d = new Date(Date.UTC(y, 2, 2));
  return iso(new Date(Date.UTC(y, 2, 2 + ((6 - d.getUTCDay() + 7) % 7))));
}

// Prima domenica di ottobre (L'Eroica, Gaiole in Chianti).
function firstSundayOfOctober(y) {
  const d = new Date(Date.UTC(y, 9, 1));
  return iso(new Date(Date.UTC(y, 9, 1 + ((7 - d.getUTCDay()) % 7))));
}

const p = n => String(n).padStart(2, "0");
const md = (y, m, d) => `${y}-${p(m)}-${p(d)}`;

export function eventsForYear(y) {
  const e = easter(y);
  const eroica = firstSundayOfOctober(y);
  const sb = stradeBianche(y);
  return [
    { name: "Palio di Siena (luglio)", from: md(y, 6, 29), to: md(y, 7, 2), uplift: 0.5 },
    { name: "Palio di Siena (agosto) e Ferragosto", from: md(y, 8, 13), to: md(y, 8, 16), uplift: 0.5 },
    { name: "Strade Bianche", from: addDays(sb, -1), to: sb, uplift: 0.4 },
    { name: "Pasqua e Pasquetta", from: addDays(e, -2), to: addDays(e, 1), uplift: 0.3 },
    { name: "Festa della Liberazione", from: md(y, 4, 24), to: md(y, 4, 26), uplift: 0.2 },
    { name: "Primo maggio", from: md(y, 4, 30), to: md(y, 5, 2), uplift: 0.2 },
    { name: "Festa della Repubblica", from: md(y, 6, 1), to: md(y, 6, 2), uplift: 0.15 },
    { name: "L'Eroica (Gaiole in Chianti)", from: addDays(eroica, -2), to: eroica, uplift: 0.2 },
    { name: "Ognissanti", from: md(y, 10, 31), to: md(y, 11, 1), uplift: 0.15 },
    { name: "Immacolata", from: md(y, 12, 6), to: md(y, 12, 8), uplift: 0.2 },
    { name: "Natale", from: md(y, 12, 23), to: md(y, 12, 26), uplift: 0.25 },
    { name: "Capodanno", from: md(y, 12, 29), to: md(y + 1, 1, 1), uplift: 0.4 },
    { name: "Epifania", from: md(y, 1, 4), to: md(y, 1, 6), uplift: 0.15 }
  ];
}

// Eventi attivi in una data (predefiniti + personalizzati dall'admin).
export function eventsOn(date, customEvents = []) {
  const y = Number(date.slice(0, 4));
  const all = [...eventsForYear(y - 1), ...eventsForYear(y), ...customEvents];
  return all.filter(ev => date >= ev.from && date <= ev.to);
}
