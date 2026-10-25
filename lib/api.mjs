// Router delle API, usato sia dalla funzione Netlify sia dal server locale.
import { randomUUID, timingSafeEqual } from "node:crypto";
import { read, write } from "./store.mjs";
import { mergeSettings, publicRules, DEFAULT_SETTINGS } from "./settings.mjs";
import { suggestPrice, nightlyPrice } from "./pricing.mjs";
import { computeQuote } from "./quote.mjs";
import { portalBlocks, buildIcs } from "./ical.mjs";
import { stripe, stripeEnabled, verifyWebhook, cents } from "./stripe.mjs";
import { sendEmail, guestConfirmation, ownerNotification } from "./email.mjs";
import { addDays, diffDays, isDate, nights, today } from "./dates.mjs";

const PENDING_MINUTES = 35;
const MAX_NIGHTS = 30;
const SEARCH_WINDOW_DAYS = 30;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (message, status = 400) => json({ error: message }, status);

// ---------- Stato ----------

async function loadState({ forcePortals = false } = {}) {
  const settings = mergeSettings(await read("settings", null));
  const [overrides, blocks, bookings, portal] = await Promise.all([
    read("prices", {}), read("blocks", []), read("bookings", []), portalBlocks(settings, { force: forcePortals })
  ]);
  return { settings, overrides, blocks, bookings, portal };
}

const isActive = b =>
  b.status === "confirmed" || (b.status === "pending" && Date.parse(b.expiresAt) > Date.now());

// Notte → origine dell'occupazione.
function occupancy(state, { excludeId } = {}) {
  const map = new Map();
  for (const b of state.bookings) {
    if (b.id === excludeId || !isActive(b)) continue;
    for (const n of nights(b.checkIn, b.checkOut)) map.set(n, { type: "direct", id: b.id, status: b.status });
  }
  for (const r of state.portal) for (const n of nights(r.from, r.to)) if (!map.has(n)) map.set(n, { type: r.source });
  for (const r of state.blocks) for (const n of nights(r.from, r.to)) if (!map.has(n)) map.set(n, { type: "block", note: r.note });
  return map;
}

async function searchStats() {
  const raw = await read("searches", {});
  const since = addDays(today(), -SEARCH_WINDOW_DAYS);
  const counts = new Map();
  let total = 0;
  for (const [night, days] of Object.entries(raw)) {
    let n = 0;
    for (const [day, c] of Object.entries(days)) if (day >= since) n += c;
    if (n) counts.set(night, n);
    total += n;
  }
  return { counts, total };
}

async function pricingFor(state, from, to) {
  const occ = occupancy(state);
  const { counts, total } = await searchStats();
  const horizon = nights(today(), addDays(today(), 180));
  const avg = horizon.reduce((a, d) => a + (counts.get(d) || 0), 0) / horizon.length;
  const ctx = { settings: state.settings, blocked: new Set(occ.keys()), searches: counts, avgSearches: avg, totalSearches: total };
  return nights(from, to).map(date => {
    const suggestion = suggestPrice(date, ctx);
    const price = nightlyPrice(date, { settings: state.settings, overrides: state.overrides, suggestion });
    return { date, price, suggestion, occupied: occ.get(date) || null, searches: counts.get(date) || 0 };
  });
}

function monthRange(url, defMonths) {
  const from = url.searchParams.get("from");
  const months = Math.min(24, Math.max(1, Number(url.searchParams.get("months")) || defMonths));
  const start = isDate(from) ? from : `${today().slice(0, 7)}-01`;
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return { from: start, to: d.toISOString().slice(0, 10) };
}

// ---------- Prenotazioni ----------

async function saveBooking(booking) {
  const bookings = await read("bookings", []);
  const i = bookings.findIndex(b => b.id === booking.id);
  if (i >= 0) bookings[i] = booking; else bookings.push(booking);
  await write("bookings", bookings);
}

async function confirmBooking(booking, settings, extra = {}) {
  if (booking.status === "confirmed") return booking;
  Object.assign(booking, extra, {
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
    amountPaid: booking.quote.dueNow,
    balanceDue: booking.quote.balance
  });
  booking.payments = [...(booking.payments || []), { at: booking.confirmedAt, amount: booking.quote.dueNow, kind: booking.payMode === "full" ? "full" : "deposit" }];
  await saveBooking(booking);
  // Un problema con le email non deve annullare una prenotazione già pagata.
  try {
    await sendEmail(guestConfirmation(booking, settings));
    if (settings.ownerEmail) await sendEmail(ownerNotification(booking, settings));
  } catch (err) {
    console.error("Email di conferma non inviata", err);
  }
  return booking;
}

async function checkout(req) {
  const body = await req.json().catch(() => null);
  if (!body) return fail("Richiesta non valida");
  const { checkIn, checkOut, payMode, lang } = body;
  const name = String(body.name || "").trim().slice(0, 100);
  const email = String(body.email || "").trim().slice(0, 200);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const guests = Number(body.guests);

  const state = await loadState({ forcePortals: true });
  const s = state.settings;
  if (!isDate(checkIn) || !isDate(checkOut) || checkIn < today()) return fail("Date non valide");
  const n = diffDays(checkIn, checkOut);
  if (n < s.minNights || n > MAX_NIGHTS) return fail(`Il soggiorno deve essere tra ${s.minNights} e ${MAX_NIGHTS} notti`);
  if (!Number.isInteger(guests) || guests < 1 || guests > s.maxGuests) return fail("Numero di ospiti non valido");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Inserisci nome ed email validi");
  if (!["full", "deposit"].includes(payMode)) return fail("Modalità di pagamento non valida");

  const occ = occupancy(state);
  if (nights(checkIn, checkOut).some(d => occ.has(d))) return fail("Le date selezionate non sono più disponibili", 409);

  const days = await pricingFor(state, checkIn, checkOut);
  const quote = computeQuote({ prices: days.map(d => d.price), guests, payMode, rules: publicRules(s) });
  const booking = {
    id: randomUUID(), status: "pending", createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + PENDING_MINUTES * 60000).toISOString(),
    checkIn, checkOut, guests, name, email, phone, lang: lang === "en" ? "en" : "it",
    payMode, quote, nightly: days.map(d => ({ date: d.date, price: d.price })), amountPaid: 0, balanceDue: quote.total
  };
  await saveBooking(booking);

  const origin = new URL(req.url).origin;
  const back = booking.lang === "en" ? "/en/booking.html" : "/conferma.html";

  if (!stripeEnabled()) {
    // Modalità demo: nessun pagamento reale, la prenotazione viene confermata subito.
    await confirmBooking(booking, s, { demo: true });
    return json({ url: `${origin}${back}?id=${booking.id}`, demo: true });
  }

  const label = booking.lang === "en"
    ? `La Finestra sul Verde · ${checkIn} → ${checkOut} · ${payMode === "full" ? "full payment" : `${s.depositPercent}% deposit`}`
    : `La Finestra sul Verde · ${checkIn} → ${checkOut} · ${payMode === "full" ? "saldo completo" : `acconto ${s.depositPercent}%`}`;
  const session = await stripe("POST", "/checkout/sessions", {
    mode: "payment",
    locale: booking.lang,
    customer_email: email,
    customer_creation: "always",
    client_reference_id: booking.id,
    metadata: { bookingId: booking.id },
    line_items: { 0: { quantity: 1, price_data: { currency: "eur", unit_amount: cents(quote.dueNow), product_data: { name: label } } } },
    // Con l'acconto la carta viene salvata per poter addebitare saldo o penali.
    payment_intent_data: { metadata: { bookingId: booking.id }, setup_future_usage: payMode === "deposit" ? "off_session" : undefined },
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    success_url: `${origin}${back}?id=${booking.id}`,
    cancel_url: `${origin}${back}?id=${booking.id}&cancelled=1`
  });
  booking.stripe = { sessionId: session.id };
  await saveBooking(booking);
  return json({ url: session.url });
}

async function stripeWebhook(req) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) return fail("Firma non valida", 400);
  const event = JSON.parse(raw);
  const obj = event.data?.object || {};
  const id = obj.metadata?.bookingId || obj.client_reference_id;
  const bookings = await read("bookings", []);
  const booking = bookings.find(b => b.id === id);
  if (!booking) return json({ received: true });

  if (event.type === "checkout.session.completed" && obj.payment_status === "paid") {
    const settings = mergeSettings(await read("settings", null));
    let paymentMethod = null;
    // La carta resta utilizzabile per addebiti successivi solo con l'acconto (salvata con setup_future_usage).
    if (obj.payment_intent && booking.payMode === "deposit") {
      const pi = await stripe("GET", `/payment_intents/${obj.payment_intent}`);
      paymentMethod = pi.payment_method;
    }
    await confirmBooking(booking, settings, {
      stripe: { ...booking.stripe, sessionId: obj.id, customer: obj.customer, paymentIntent: obj.payment_intent, paymentMethod }
    });
  } else if (event.type === "checkout.session.expired" && booking.status === "pending") {
    booking.status = "expired";
    await saveBooking(booking);
  }
  return json({ received: true });
}

// ---------- Pubblico ----------

async function availability(url) {
  const { from, to } = monthRange(url, 18);
  const state = await loadState();
  const days = await pricingFor(state, from < today() ? today() : from, to);
  return json({
    from, to,
    nights: Object.fromEntries(days.map(d => [d.date, d.occupied ? { busy: true } : { price: d.price }])),
    rules: publicRules(state.settings),
    payments: stripeEnabled() ? "stripe" : "demo"
  });
}

async function trackSearch(req) {
  const body = await req.json().catch(() => ({}));
  const { checkIn, checkOut } = body;
  if (!isDate(checkIn) || !isDate(checkOut) || checkOut <= checkIn || diffDays(checkIn, checkOut) > MAX_NIGHTS) return fail("Date non valide");
  const raw = await read("searches", {});
  const day = today();
  const oldest = addDays(day, -60);
  for (const n of nights(checkIn, checkOut)) {
    raw[n] ||= {};
    raw[n][day] = (raw[n][day] || 0) + 1;
  }
  // Pulizia: via le notti passate e le ricerche troppo vecchie.
  for (const [n, days] of Object.entries(raw)) {
    if (n < day) { delete raw[n]; continue; }
    for (const d of Object.keys(days)) if (d < oldest) delete days[d];
  }
  await write("searches", raw);
  return json({ ok: true });
}

async function bookingStatus(url) {
  const id = url.searchParams.get("id");
  const b = (await read("bookings", [])).find(x => x.id === id);
  if (!b) return fail("Prenotazione non trovata", 404);
  return json({
    status: b.status, checkIn: b.checkIn, checkOut: b.checkOut, guests: b.guests, name: b.name,
    total: b.quote.total, amountPaid: b.amountPaid, balanceDue: b.balanceDue, payMode: b.payMode, code: b.id.slice(0, 8).toUpperCase()
  });
}

async function calendarIcs() {
  const bookings = (await read("bookings", [])).filter(isActive);
  const blocks = await read("blocks", []);
  return new Response(buildIcs(bookings, blocks), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
}

// ---------- Admin ----------

const adminPassword = () => (process.env.ADMIN_PASSWORD || "").trim();

// La password arriva codificata (encodeURIComponent) per supportare accenti e simboli negli header.
function isAdmin(req) {
  const pass = adminPassword();
  let given = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  try { given = decodeURIComponent(given); } catch { return false; }
  given = given.trim();
  if (!pass || !given) return false;
  const a = Buffer.from(pass), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function adminOverview(url) {
  const { from, to } = monthRange(url, 2);
  const state = await loadState();
  const days = await pricingFor(state, from, to);
  const cache = await read("ical-cache", {});
  const { total } = await searchStats();
  return json({
    days: days.map(d => ({
      date: d.date, price: d.price, override: state.overrides[d.date] ?? null,
      suggested: d.suggestion.price, demand: d.suggestion.demand, factors: d.suggestion.factors, events: d.suggestion.events,
      occupied: d.occupied, searches: d.searches
    })),
    bookings: state.bookings.filter(b => b.status !== "pending" || isActive(b)).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    blocks: state.blocks,
    settings: state.settings,
    defaults: DEFAULT_SETTINGS,
    portals: Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, { at: v.at, error: v.error, count: v.ranges?.length || 0 }])),
    searchesLast30: total,
    stripe: stripeEnabled(),
    email: Boolean(process.env.RESEND_API_KEY)
  });
}

const NUM_FIELDS = ["basePrice", "minPrice", "maxPrice", "weekendUplift", "cleaningFee", "touristTax", "touristTaxMaxNights", "minNights", "maxGuests", "onlineDiscount", "depositPercent", "freeCancellationDays"];
const STR_FIELDS = ["icalAirbnb", "icalBooking", "ownerEmail", "address", "checkinInstructions", "checkinFrom", "checkinTo", "checkoutBy"];

async function adminSettings(req) {
  const body = await req.json().catch(() => null);
  if (!body) return fail("Richiesta non valida");
  const current = mergeSettings(await read("settings", null));
  for (const k of NUM_FIELDS) if (body[k] != null) {
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < 0) return fail(`Valore non valido: ${k}`);
    current[k] = v;
  }
  for (const k of STR_FIELDS) if (body[k] != null) current[k] = String(body[k]).slice(0, 2000);
  if (body.autoPricing != null) current.autoPricing = Boolean(body.autoPricing);
  if (Array.isArray(body.seasonality) && body.seasonality.length === 12) current.seasonality = body.seasonality.map(v => Math.min(3, Math.max(0.3, Number(v) || 1)));
  if (Array.isArray(body.customEvents)) {
    current.customEvents = body.customEvents
      .filter(e => isDate(e.from) && isDate(e.to) && e.to >= e.from)
      .map(e => ({ name: String(e.name || "Evento").slice(0, 80), from: e.from, to: e.to, uplift: Math.min(3, Math.max(-0.5, Number(e.uplift) || 0)) }));
  }
  if (current.minPrice > current.maxPrice) return fail("Il prezzo minimo supera il massimo");
  await write("settings", current);
  return json({ ok: true, settings: current });
}

async function adminPrices(req) {
  const { dates, price } = await req.json().catch(() => ({}));
  if (!Array.isArray(dates) || !dates.every(isDate)) return fail("Date non valide");
  if (price !== null && !(Number(price) > 0)) return fail("Prezzo non valido");
  const overrides = await read("prices", {});
  for (const d of dates) {
    if (price === null) delete overrides[d]; else overrides[d] = Math.round(Number(price));
  }
  for (const d of Object.keys(overrides)) if (d < addDays(today(), -1)) delete overrides[d];
  await write("prices", overrides);
  return json({ ok: true });
}

async function adminBlocks(req) {
  const { dates, blocked, note } = await req.json().catch(() => ({}));
  if (!Array.isArray(dates) || !dates.every(isDate)) return fail("Date non valide");
  // Si lavora per notti singole e poi si ricompattano gli intervalli.
  const set = new Set((await read("blocks", [])).flatMap(b => nights(b.from, b.to)));
  for (const d of dates) blocked ? set.add(d) : set.delete(d);
  const sorted = [...set].filter(d => d >= addDays(today(), -1)).sort();
  const ranges = [];
  for (const d of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.to === d) last.to = addDays(d, 1);
    else ranges.push({ from: d, to: addDays(d, 1), note: note ? String(note).slice(0, 100) : "" });
  }
  await write("blocks", ranges);
  return json({ ok: true });
}

async function adminBookingAction(req, id, action) {
  const bookings = await read("bookings", []);
  const b = bookings.find(x => x.id === id);
  if (!b) return fail("Prenotazione non trovata", 404);
  const body = await req.json().catch(() => ({}));

  if (action === "cancel") {
    b.status = "cancelled";
    b.cancelledAt = new Date().toISOString();
  } else if (action === "paid") {
    // Saldo incassato in struttura (contanti o POS).
    b.payments = [...(b.payments || []), { at: new Date().toISOString(), amount: b.balanceDue, kind: "onsite" }];
    b.amountPaid = Math.round((b.amountPaid + b.balanceDue) * 100) / 100;
    b.balanceDue = 0;
  } else if (action === "charge") {
    // Addebito sulla carta a garanzia: saldo, penale per mancata presentazione o danni.
    if (!stripeEnabled()) return fail("Stripe non è configurato");
    if (!b.stripe?.customer || !b.stripe?.paymentMethod) return fail("Nessuna carta salvata per questa prenotazione");
    const amount = Number(body.amount ?? b.balanceDue);
    if (!(amount > 0)) return fail("Importo non valido");
    try {
      const pi = await stripe("POST", "/payment_intents", {
        amount: cents(amount), currency: "eur", customer: b.stripe.customer, payment_method: b.stripe.paymentMethod,
        off_session: true, confirm: true, description: `La Finestra sul Verde · ${b.checkIn} · ${body.reason || "saldo"}`,
        metadata: { bookingId: b.id }
      });
      b.payments = [...(b.payments || []), { at: new Date().toISOString(), amount, kind: body.reason || "charge", ref: pi.id }];
      b.amountPaid = Math.round((b.amountPaid + amount) * 100) / 100;
      b.balanceDue = Math.max(0, Math.round((b.balanceDue - amount) * 100) / 100);
    } catch (err) {
      return fail(`Addebito non riuscito: ${err.message}`, 402);
    }
  } else {
    return fail("Azione sconosciuta", 404);
  }
  await write("bookings", bookings);
  return json({ ok: true, booking: b });
}

// ---------- Router ----------

export async function handle(req) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, "");
  const m = req.method;
  try {
    if (m === "GET" && p === "/api/availability") return await availability(url);
    if (m === "POST" && p === "/api/search") return await trackSearch(req);
    if (m === "POST" && p === "/api/checkout") return await checkout(req);
    if (m === "POST" && p === "/api/stripe/webhook") return await stripeWebhook(req);
    if (m === "GET" && p === "/api/booking") return await bookingStatus(url);
    if (m === "GET" && p === "/api/calendar.ics") return await calendarIcs();

    if (p.startsWith("/api/admin")) {
      if (!adminPassword()) return fail("ADMIN_PASSWORD non è impostata su Netlify", 503);
      if (!isAdmin(req)) return fail("Accesso non autorizzato", 401);
      if (m === "GET" && p === "/api/admin/overview") return await adminOverview(url);
      if (m === "PUT" && p === "/api/admin/settings") return await adminSettings(req);
      if (m === "PUT" && p === "/api/admin/prices") return await adminPrices(req);
      if (m === "PUT" && p === "/api/admin/blocks") return await adminBlocks(req);
      if (m === "POST" && p === "/api/admin/sync") { await loadState({ forcePortals: true }); return json({ ok: true }); }
      const action = p.match(/^\/api\/admin\/bookings\/([\w-]+)\/(cancel|paid|charge)$/);
      if (m === "POST" && action) return await adminBookingAction(req, action[1], action[2]);
    }
    return fail("Non trovato", 404);
  } catch (err) {
    console.error(err);
    return fail("Errore del server, riprova tra poco", 500);
  }
}
