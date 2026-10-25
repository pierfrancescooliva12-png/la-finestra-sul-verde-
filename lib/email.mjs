// Email automatiche tramite Resend (https://resend.com).
// Senza RESEND_API_KEY le email vengono solo scritte nel log (modalità demo).
const eur = (n, lang) => new Intl.NumberFormat(lang === "en" ? "en-GB" : "it-IT", { style: "currency", currency: "EUR" }).format(n);
const fmtDate = (s, lang) => new Date(`${s}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "it-IT", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export async function sendEmail({ to, subject, html, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    console.info(`[email demo] → ${to} · ${subject}`);
    return { demo: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "La Finestra sul Verde <onboarding@resend.dev>",
      to: [to], subject, html, reply_to: replyTo || undefined
    })
  });
  if (!res.ok) console.error("Invio email fallito", res.status, await res.text());
  return { ok: res.ok };
}

const T = {
  it: {
    subject: b => `Prenotazione confermata · ${fmtDate(b.checkIn, "it")}`,
    hello: n => `Gentile ${n},`,
    intro: "grazie per aver scelto La Finestra sul Verde. La tua prenotazione è confermata.",
    checkIn: "Arrivo", checkOut: "Partenza", guests: "Ospiti", nights: "Notti", code: "Codice prenotazione",
    total: "Totale soggiorno", paid: "Pagato online", balance: "Saldo da pagare all'arrivo",
    deposit: p => `Hai versato un acconto del ${p}%. La carta utilizzata resta registrata come garanzia: il saldo si paga al check-in in contanti o con carta.`,
    full: "Il soggiorno è interamente pagato.",
    cancel: d => `Cancellazione gratuita fino a ${d} giorni prima dell'arrivo.`,
    arrival: "Come arrivare", times: s => `Check-in dalle ${s.checkinFrom} alle ${s.checkinTo} · Check-out entro le ${s.checkoutBy}`,
    sign: "A presto a Siena!"
  },
  en: {
    subject: b => `Booking confirmed · ${fmtDate(b.checkIn, "en")}`,
    hello: n => `Dear ${n},`,
    intro: "thank you for choosing La Finestra sul Verde. Your booking is confirmed.",
    checkIn: "Check-in", checkOut: "Check-out", guests: "Guests", nights: "Nights", code: "Booking reference",
    total: "Total stay", paid: "Paid online", balance: "Balance due on arrival",
    deposit: p => `You paid a ${p}% deposit. Your card is kept on file as a guarantee: the balance is paid at check-in, in cash or by card.`,
    full: "Your stay is fully paid.",
    cancel: d => `Free cancellation up to ${d} days before arrival.`,
    arrival: "Getting here", times: s => `Check-in ${s.checkinFrom}–${s.checkinTo} · Check-out by ${s.checkoutBy}`,
    sign: "See you soon in Siena!"
  }
};

function row(label, value) {
  return `<tr><td style="padding:6px 0;color:#5c6356">${label}</td><td style="padding:6px 0;text-align:right">${value}</td></tr>`;
}

export function guestConfirmation(b, settings) {
  const lang = b.lang === "en" ? "en" : "it";
  const t = T[lang];
  const q = b.quote;
  const arrival = settings.address || settings.checkinInstructions
    ? `<h3 style="font-family:Georgia,serif;font-weight:400">${t.arrival}</h3>
       <p>${esc(settings.address)}</p><p style="white-space:pre-line">${esc(settings.checkinInstructions)}</p>`
    : "";
  const html = `
  <div style="font-family:Helvetica,Arial,sans-serif;color:#23271f;max-width:560px;margin:auto;line-height:1.6">
    <p style="font-family:Georgia,serif;font-size:22px;color:#34492f;margin:0 0 24px">La Finestra <em>sul Verde</em></p>
    <p>${t.hello(esc(b.name))}<br>${t.intro}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #dcdfd5;border-bottom:1px solid #dcdfd5;margin:20px 0">
      ${row(t.code, b.id.slice(0, 8).toUpperCase())}
      ${row(t.checkIn, fmtDate(b.checkIn, lang))}
      ${row(t.checkOut, fmtDate(b.checkOut, lang))}
      ${row(t.nights, q.nights)}
      ${row(t.guests, b.guests)}
      ${row(t.total, eur(q.total, lang))}
      ${row(t.paid, eur(b.amountPaid, lang))}
      ${b.balanceDue > 0 ? row(`<strong>${t.balance}</strong>`, `<strong>${eur(b.balanceDue, lang)}</strong>`) : ""}
    </table>
    <p>${b.payMode === "deposit" ? t.deposit(settings.depositPercent) : t.full}</p>
    <p>${t.cancel(settings.freeCancellationDays)}<br>${t.times(settings)}</p>
    ${arrival}
    <p>${t.sign}</p>
  </div>`;
  return { to: b.email, subject: t.subject(b), html, replyTo: settings.ownerEmail };
}

export function ownerNotification(b, settings) {
  const q = b.quote;
  const html = `
  <div style="font-family:Helvetica,Arial,sans-serif;color:#23271f;line-height:1.6">
    <p><strong>Nuova prenotazione diretta</strong></p>
    <p>${esc(b.name)} · ${esc(b.email)} · ${esc(b.phone || "—")}<br>
    ${fmtDate(b.checkIn, "it")} → ${fmtDate(b.checkOut, "it")} · ${q.nights} notti · ${b.guests} ospiti</p>
    <p>Totale ${eur(q.total, "it")} · incassato ${eur(b.amountPaid, "it")} · saldo all'arrivo ${eur(b.balanceDue, "it")}<br>
    Modalità: ${b.payMode === "deposit" ? "acconto + carta a garanzia" : "pagato tutto online"}</p>
  </div>`;
  return { to: settings.ownerEmail, subject: `Nuova prenotazione: ${b.name}, ${b.checkIn}`, html };
}
