(async () => {
  const lang = document.documentElement.lang === "en" ? "en" : "it";
  const T = {
    it: {
      ok: "Prenotazione confermata", pending: "Pagamento in verifica", cancelled: "Pagamento annullato", notFound: "Prenotazione non trovata",
      okText: n => `Grazie ${n}! Ti abbiamo inviato un'email con tutti i dettagli del soggiorno.`,
      pendingText: "Stiamo ricevendo la conferma del pagamento: aggiorna la pagina tra qualche secondo. Riceverai anche un'email.",
      cancelledText: "Il pagamento non è stato completato e nessun importo è stato addebitato. Puoi riprovare quando vuoi.",
      notFoundText: "Non riusciamo a trovare questa prenotazione. Se hai pagato, controlla la tua email o contattaci.",
      code: "Codice", checkIn: "Arrivo", checkOut: "Partenza", guests: "Ospiti", total: "Totale", paid: "Pagato", balance: "Saldo all'arrivo",
      back: "Torna al sito", retry: "Scegli di nuovo le date", locale: "it-IT"
    },
    en: {
      ok: "Booking confirmed", pending: "Confirming payment", cancelled: "Payment cancelled", notFound: "Booking not found",
      okText: n => `Thank you ${n}! We've sent you an email with all the details of your stay.`,
      pendingText: "We're waiting for the payment confirmation: refresh this page in a few seconds. You'll also receive an email.",
      cancelledText: "The payment wasn't completed and you haven't been charged. You can try again whenever you like.",
      notFoundText: "We can't find this booking. If you paid, please check your email or contact us.",
      code: "Reference", checkIn: "Check‑in", checkOut: "Check‑out", guests: "Guests", total: "Total", paid: "Paid", balance: "Balance on arrival",
      back: "Back to the website", retry: "Choose your dates again", locale: "en-GB"
    }
  }[lang];
  const home = lang === "en" ? "/en/" : "/";
  const $ = id => document.getElementById(id);
  const eur = n => new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR" }).format(n);
  const date = s => new Date(`${s}T12:00:00`).toLocaleDateString(T.locale, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const params = new URLSearchParams(location.search);
  $("c-back").href = home;
  $("c-back").textContent = T.back;

  const show = (title, text) => { $("c-title").textContent = title; $("c-text").textContent = text; };

  if (params.get("cancelled")) {
    show(T.cancelled, T.cancelledText);
    $("c-back").href = `${home}#${lang === "en" ? "book" : "prenota"}`;
    $("c-back").textContent = T.retry;
    return;
  }

  let b;
  try {
    const res = await fetch(`/api/booking?id=${encodeURIComponent(params.get("id") || "")}`);
    if (!res.ok) throw new Error();
    b = await res.json();
  } catch {
    show(T.notFound, T.notFoundText);
    return;
  }

  if (b.status !== "confirmed") {
    show(T.pending, T.pendingText);
    setTimeout(() => location.reload(), 4000);
    return;
  }

  show(T.ok, T.okText(b.name.split(" ")[0]));
  const rows = [[T.code, b.code], [T.checkIn, date(b.checkIn)], [T.checkOut, date(b.checkOut)], [T.guests, b.guests],
    [T.total, eur(b.total)], [T.paid, eur(b.amountPaid)], ...(b.balanceDue > 0 ? [[T.balance, eur(b.balanceDue)]] : [])];
  $("c-list").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  $("c-list").hidden = false;
})();
