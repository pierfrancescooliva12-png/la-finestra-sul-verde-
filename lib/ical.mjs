// Sincronizzazione calendari con Airbnb e Booking tramite iCal.
import { read, write } from "./store.mjs";

const CACHE_MINUTES = 15;

const toIso = v => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;

// Estrae gli intervalli occupati da un file .ics: [{ from, to }] con "to" = giorno di check-out.
export function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out = [];
  let ev = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") ev = {};
    else if (line === "END:VEVENT") {
      if (ev?.from && ev?.to) out.push(ev);
      ev = null;
    } else if (ev) {
      const m = line.match(/^(DTSTART|DTEND)[^:]*:(\d{8})/);
      if (m) ev[m[1] === "DTSTART" ? "from" : "to"] = toIso(m[2]);
      if (line.startsWith("SUMMARY:")) ev.summary = line.slice(8);
    }
  }
  return out;
}

// Intervalli occupati dai portali, con cache per non interrogarli a ogni visita.
export async function portalBlocks(settings, { force = false } = {}) {
  const sources = { airbnb: settings.icalAirbnb, booking: settings.icalBooking };
  const cache = await read("ical-cache", {});
  const result = [];
  let changed = false;
  for (const [source, url] of Object.entries(sources)) {
    if (!url) continue;
    const c = cache[source];
    const fresh = c && c.url === url && Date.now() - c.at < CACHE_MINUTES * 60000;
    if (fresh && !force) {
      result.push(...c.ranges.map(r => ({ ...r, source })));
      continue;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ranges = parseIcs(await res.text());
      cache[source] = { url, at: Date.now(), ranges, error: null };
      result.push(...ranges.map(r => ({ ...r, source })));
    } catch (err) {
      // Se il portale non risponde si usa l'ultima copia valida.
      cache[source] = { ...(c || { ranges: [] }), url, at: Date.now(), error: String(err.message || err) };
      result.push(...cache[source].ranges.map(r => ({ ...r, source })));
    }
    changed = true;
  }
  if (changed) await write("ical-cache", cache);
  return result;
}

// Calendario delle prenotazioni dirette, da importare su Airbnb e Booking.
export function buildIcs(bookings, blocks) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const d = s => s.replace(/-/g, "");
  const events = [
    ...bookings.map(b => ({ uid: `${b.id}@lafinestrasulverde`, from: b.checkIn, to: b.checkOut, summary: "Prenotazione diretta" })),
    ...blocks.map((b, i) => ({ uid: `block-${b.from}-${i}@lafinestrasulverde`, from: b.from, to: b.to, summary: "Non disponibile" }))
  ];
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//La Finestra sul Verde//IT", "CALSCALE:GREGORIAN",
    ...events.flatMap(e => [
      "BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d(e.from)}`, `DTEND;VALUE=DATE:${d(e.to)}`, `SUMMARY:${e.summary}`, "END:VEVENT"
    ]),
    "END:VCALENDAR"
  ].join("\r\n");
}
