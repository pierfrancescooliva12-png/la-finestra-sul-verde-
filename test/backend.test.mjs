import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.STORAGE = "file";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "finestra-"));
process.env.ADMIN_PASSWORD = "segreta";

const { handle } = await import("../lib/api.mjs");
const { suggestPrice } = await import("../lib/pricing.mjs");
const { parseIcs, buildIcs } = await import("../lib/ical.mjs");
const { computeQuote } = await import("../lib/quote.mjs");
const { verifyWebhook } = await import("../lib/stripe.mjs");
const { DEFAULT_SETTINGS } = await import("../lib/settings.mjs");
const { addDays, today } = await import("../lib/dates.mjs");

const call = (method, p, body, headers = {}) =>
  handle(new Request(`http://localhost${p}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }));
const admin = { Authorization: "Bearer segreta" };
const ctx = (extra = {}) => ({ settings: DEFAULT_SETTINGS, blocked: new Set(), searches: new Map(), avgSearches: 0, totalSearches: 0, now: "2027-01-10", ...extra });

test("il Palio fa salire il prezzo suggerito", () => {
  const normal = suggestPrice("2027-07-07", ctx());
  const palio = suggestPrice("2027-07-02", ctx());
  assert.ok(palio.price > normal.price);
  assert.ok(palio.factors.some(f => f.label.includes("Palio")));
});

test("una data vicina e libera viene scontata, i limiti min/max sono rispettati", () => {
  const near = suggestPrice("2027-01-12", ctx());
  assert.ok(near.factors.some(f => f.label.startsWith("Ultimo minuto")));
  assert.ok(near.price >= DEFAULT_SETTINGS.minPrice);
  const capped = suggestPrice("2027-08-14", ctx({ settings: { ...DEFAULT_SETTINGS, maxPrice: 150 } }));
  assert.equal(capped.price, 150);
});

test("molte ricerche sul sito alzano il prezzo", () => {
  const searches = new Map([["2027-05-12", 40]]);
  const hot = suggestPrice("2027-05-12", ctx({ searches, avgSearches: 1, totalSearches: 60 }));
  const cold = suggestPrice("2027-05-12", ctx());
  assert.ok(hot.price > cold.price);
});

test("parsing e generazione iCal", () => {
  const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261106\r\nDTEND;VALUE=DATE:20261109\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nEND:VCALENDAR";
  assert.deepEqual(parseIcs(ics), [{ from: "2026-11-06", to: "2026-11-09", summary: "Reserved" }]);
  const out = buildIcs([{ id: "abc", checkIn: "2026-12-01", checkOut: "2026-12-03" }], []);
  assert.match(out, /DTSTART;VALUE=DATE:20261201/);
});

test("preventivo con acconto", () => {
  const q = computeQuote({ prices: [100, 120], guests: 2, payMode: "deposit", rules: { ...DEFAULT_SETTINGS } });
  assert.equal(q.total, 220 + 35 + 2 * 2 * 2.5);
  assert.equal(q.dueNow, Math.round(q.total * 0.2 * 100) / 100);
  assert.equal(q.balance, Math.round((q.total - q.dueNow) * 100) / 100);
});

test("firma webhook Stripe", () => {
  const body = '{"a":1}', secret = "whsec_test", t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.ok(verifyWebhook(body, `t=${t},v1=${sig}`, secret));
  assert.ok(!verifyWebhook(body, `t=${t},v1=${"0".repeat(64)}`, secret));
  assert.ok(!verifyWebhook(body, `t=${t - 4000},v1=${sig}`, secret));
});

test("prenotazione demo: conferma, date bloccate, doppia prenotazione rifiutata", async () => {
  const checkIn = addDays(today(), 40), checkOut = addDays(today(), 43);
  const guest = { checkIn, checkOut, guests: 2, payMode: "deposit", name: "Anna Bianchi", email: "anna@example.com", lang: "it" };
  const res = await call("POST", "/api/checkout", guest);
  assert.equal(res.status, 200);
  const { url } = await res.json();
  const id = new URL(url).searchParams.get("id");
  const status = await (await call("GET", `/api/booking?id=${id}`)).json();
  assert.equal(status.status, "confirmed");
  assert.ok(status.balanceDue > 0 && status.amountPaid > 0);

  const avail = await (await call("GET", `/api/availability?from=${checkIn.slice(0, 7)}-01&months=2`)).json();
  assert.equal(avail.nights[checkIn].busy, true);
  assert.equal(avail.nights[checkOut].busy, undefined);

  const again = await call("POST", "/api/checkout", { ...guest, checkIn: addDays(checkIn, 1), checkOut: addDays(checkOut, 1) });
  assert.equal(again.status, 409);
});

test("validazioni del checkout", async () => {
  const base = { checkIn: addDays(today(), 60), checkOut: addDays(today(), 61), guests: 2, payMode: "full", name: "X", email: "x@y.it" };
  assert.equal((await call("POST", "/api/checkout", base)).status, 400); // sotto il minimo notti
  assert.equal((await call("POST", "/api/checkout", { ...base, checkOut: addDays(today(), 63), guests: 9 })).status, 400);
  assert.equal((await call("POST", "/api/checkout", { ...base, checkOut: addDays(today(), 63), email: "no" })).status, 400);
});

test("admin: accesso protetto, prezzo manuale e blocco date", async () => {
  assert.equal((await call("GET", "/api/admin/overview")).status, 401);
  assert.equal((await call("GET", "/api/admin/overview", null, { Authorization: "Bearer sbagliata" })).status, 401);
  const d = addDays(today(), 70);
  await call("PUT", "/api/admin/prices", { dates: [d], price: 199 }, admin);
  let avail = await (await call("GET", `/api/availability?from=${d.slice(0, 7)}-01&months=1`)).json();
  assert.equal(avail.nights[d].price, 199);
  await call("PUT", "/api/admin/blocks", { dates: [d], blocked: true }, admin);
  avail = await (await call("GET", `/api/availability?from=${d.slice(0, 7)}-01&months=1`)).json();
  assert.equal(avail.nights[d].busy, true);
  const ov = await (await call("GET", `/api/admin/overview?from=${d.slice(0, 7)}-01&months=1`, null, admin)).json();
  assert.equal(ov.days.find(x => x.date === d).occupied.type, "block");
});

test("flusso Stripe simulato: checkout, webhook firmato, addebito saldo", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body ? String(opts.body) : "" });
    const u = String(url);
    const reply = o => new Response(JSON.stringify(o), { status: 200 });
    if (u.endsWith("/checkout/sessions")) return reply({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
    if (u.includes("/payment_intents/pi_1")) return reply({ id: "pi_1", payment_method: "pm_1" });
    if (u.endsWith("/payment_intents")) return reply({ id: "pi_2", status: "succeeded" });
    return realFetch(url, opts);
  };
  try {
    const checkIn = addDays(today(), 90), checkOut = addDays(today(), 92);
    const res = await call("POST", "/api/checkout", { checkIn, checkOut, guests: 2, payMode: "deposit", name: "Tom", email: "tom@example.com", lang: "en" });
    const out = await res.json();
    assert.equal(out.url, "https://checkout.stripe.com/c/cs_1");
    const sessionBody = decodeURIComponent(calls[0].body);
    assert.match(sessionBody, /setup_future_usage\]=off_session/);
    assert.match(sessionBody, /locale=en/);

    const bookings = await (await call("GET", "/api/admin/overview?months=6", null, admin)).json();
    const b = bookings.bookings.find(x => x.email === "tom@example.com");
    assert.equal(b.status, "pending");

    const event = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", customer: "cus_1", metadata: { bookingId: b.id } } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec_x").update(`${t}.${event}`).digest("hex");
    const bad = await handle(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: event, headers: { "stripe-signature": `t=${t},v1=bad` } }));
    assert.equal(bad.status, 400);
    const ok = await handle(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: event, headers: { "stripe-signature": `t=${t},v1=${sig}` } }));
    assert.equal(ok.status, 200);

    const st = await (await call("GET", `/api/booking?id=${b.id}`)).json();
    assert.equal(st.status, "confirmed");

    const charge = await call("POST", `/api/admin/bookings/${b.id}/charge`, { reason: "saldo" }, admin);
    const charged = await charge.json();
    assert.equal(charge.status, 200);
    assert.equal(charged.booking.balanceDue, 0);
    assert.match(decodeURIComponent(calls.at(-1).body), /off_session=true.*customer=cus_1.*payment_method=pm_1|customer=cus_1/s);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.STRIPE_SECRET_KEY;
  }
});
