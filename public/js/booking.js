(() => {
  const lang = document.documentElement.lang === "en" ? "en" : "it";
  const T = {
    it: {
      months: ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"],
      dow: ["L","M","M","G","V","S","D"],
      guest: n => `${n} ${n === 1 ? "ospite" : "ospiti"}`,
      pickDates: "Seleziona arrivo e partenza sul calendario.",
      pickEnd: "Ora scegli la data di partenza.",
      minNights: n => `Il soggiorno minimo è di ${n} notti.`,
      nights: n => `${n} notti`, cleaning: "Pulizia finale", tax: "Imposta di soggiorno", discount: "Sconto pagamento online",
      fullNote: p => `Carta, Apple Pay, Google Pay · sconto ${p}%`,
      depositTitle: "Paga all'arrivo",
      depositNote: p => `Acconto del ${p}% ora, saldo al check‑in. La carta resta a garanzia.`,
      dueNow: "Da pagare ora", balance: "Saldo all'arrivo",
      btnFull: "Prenota e paga ora", btnDeposit: "Prenota e versa l'acconto",
      missing: "Inserisci nome ed email per completare la prenotazione.",
      terms: "Per prenotare devi accettare i termini e condizioni.",
      unavailable: "Ci dispiace, queste date sono appena state prenotate. Scegline altre.",
      sending: "Un attimo…", error: "Qualcosa non ha funzionato. Riprova o scrivici.",
      demo: "Modalità dimostrativa: i pagamenti non sono ancora attivi.",
      offline: "Calendario dimostrativo: il sistema di prenotazione non è collegato.",
      cancel: d => `Cancellazione gratuita fino a ${d} giorni prima dell'arrivo. Imposta di soggiorno inclusa.`,
      locale: "it-IT"
    },
    en: {
      months: ["January","February","March","April","May","June","July","August","September","October","November","December"],
      dow: ["M","T","W","T","F","S","S"],
      guest: n => `${n} ${n === 1 ? "guest" : "guests"}`,
      pickDates: "Select your arrival and departure dates.",
      pickEnd: "Now select your departure date.",
      minNights: n => `Minimum stay is ${n} nights.`,
      nights: n => `${n} nights`, cleaning: "Final cleaning", tax: "City tax", discount: "Online payment discount",
      fullNote: p => `Card, Apple Pay, Google Pay · ${p}% off`,
      depositTitle: "Pay on arrival",
      depositNote: p => `${p}% deposit now, balance at check‑in. Your card is kept as a guarantee.`,
      dueNow: "Due now", balance: "Balance on arrival",
      btnFull: "Book and pay now", btnDeposit: "Book and pay deposit",
      missing: "Please enter your name and email to complete the booking.",
      terms: "Please accept the terms and conditions to book.",
      unavailable: "Sorry, these dates have just been booked. Please choose others.",
      sending: "One moment…", error: "Something went wrong. Please try again or contact us.",
      demo: "Demo mode: payments are not active yet.",
      offline: "Demo calendar: the booking system is not connected.",
      cancel: d => `Free cancellation up to ${d} days before arrival. City tax included.`,
      locale: "en-GB"
    }
  }[lang];

  const eur = new Intl.NumberFormat(T.locale, { style: "currency", currency: "EUR" });
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const nightsBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const pretty = s => { const d = parse(s); return `${d.getDate()} ${T.months[d.getMonth()].slice(0, 3)}`; };
  const round2 = n => Math.round(n * 100) / 100;

  const $ = id => document.getElementById(id);
  const form = $("booking-form");
  const guests = $("guests");
  const today = iso(new Date());
  const state = { start: null, end: null, offset: 0, nights: {}, rules: null, live: false };

  // Dati dal backend; se non disponibile (es. file aperto in locale) si usa la configurazione dimostrativa.
  async function load() {
    try {
      const res = await fetch(`/api/availability?months=18`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      state.nights = data.nights;
      state.rules = data.rules;
      state.live = true;
      if (data.payments === "demo") note(T.demo);
    } catch {
      const c = window.SITE_CONFIG;
      state.rules = {
        minNights: c.minNights, maxGuests: c.maxGuests, cleaningFee: c.cleaningFee, touristTax: c.touristTaxPerPersonPerNight,
        touristTaxMaxNights: c.touristTaxMaxNights, onlineDiscount: c.onlineDiscountPercent, depositPercent: 20, freeCancellationDays: 7
      };
      const busy = new Set();
      c.blockedRanges.forEach(r => { for (let d = r.from; d < r.to; d = addDays(d, 1)) busy.add(d); });
      for (let d = today, i = 0; i < 540; i++, d = addDays(d, 1)) {
        const wd = parse(d).getDay();
        state.nights[d] = busy.has(d) ? { busy: true } : { price: (wd === 5 || wd === 6) ? c.weekendRate : c.nightlyRate };
      }
      note(T.offline);
    }
    const r = state.rules;
    for (let i = 1; i <= r.maxGuests; i++) guests.add(new Option(T.guest(i), i, i === 2, i === 2));
    $("pay-full-note").textContent = T.fullNote(r.onlineDiscount);
    $("pay-deposit-note").textContent = T.depositNote(r.depositPercent);
    $("policy").textContent = T.cancel(r.freeCancellationDays);
    renderCalendar();
    renderSummary();
  }

  function note(text) { $("booking-note").textContent = text; }

  const isFree = d => state.nights[d] && !state.nights[d].busy;
  function rangeIsFree(a, b) {
    for (let d = a; d < b; d = addDays(d, 1)) if (!isFree(d)) return false;
    return true;
  }
  // Un giorno occupato può comunque essere la data di partenza se la notte precedente è libera.
  const canBeCheckout = d => state.start && !state.end && d > state.start && rangeIsFree(state.start, d);

  function renderMonth(year, month) {
    const el = document.createElement("div");
    el.className = "month";
    T.dow.forEach(d => el.insertAdjacentHTML("beforeend", `<span class="dow">${d}</span>`));
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) el.appendChild(document.createElement("span"));
    const days = new Date(year, month + 1, 0).getDate();
    for (let n = 1; n <= days; n++) {
      const key = iso(new Date(year, month, n));
      const b = document.createElement("button");
      b.type = "button";
      b.className = "day";
      b.dataset.date = key;
      const info = state.nights[key];
      b.innerHTML = `<span>${n}</span>${info?.price && key >= today ? `<small>${Math.round(info.price)}</small>` : ""}`;
      if (key < today || !info) b.disabled = true;
      else if (info.busy && !canBeCheckout(key)) { b.classList.add("is-busy"); b.disabled = true; }
      else if (info.busy) b.classList.add("is-checkout-only");
      if (key === state.start) b.classList.add("is-start");
      if (key === state.end) b.classList.add("is-end");
      if (state.start && state.end && key > state.start && key < state.end) b.classList.add("is-range");
      el.appendChild(b);
    }
    return el;
  }

  function renderCalendar() {
    const base = new Date();
    const m1 = new Date(base.getFullYear(), base.getMonth() + state.offset, 1);
    const m2 = new Date(m1.getFullYear(), m1.getMonth() + 1, 1);
    $("cal-title").innerHTML = [m1, m2].map(m => `<span>${T.months[m.getMonth()]} ${m.getFullYear()}</span>`).join("");
    $("cal-body").replaceChildren(renderMonth(m1.getFullYear(), m1.getMonth()), renderMonth(m2.getFullYear(), m2.getMonth()));
    $("cal-prev").disabled = state.offset === 0;
    $("cal-next").disabled = state.offset >= 16;
  }

  function quote() {
    if (!state.start || !state.end) return null;
    const r = state.rules;
    const prices = [];
    for (let d = state.start; d < state.end; d = addDays(d, 1)) prices.push(state.nights[d].price);
    const n = prices.length, g = Number(guests.value), payMode = form.pay.value;
    const stay = prices.reduce((a, b) => a + b, 0);
    const tax = Math.min(n, r.touristTaxMaxNights) * g * r.touristTax;
    const discount = payMode === "full" ? Math.round(stay * r.onlineDiscount) / 100 : 0;
    const total = round2(stay + r.cleaningFee + tax - discount);
    const dueNow = payMode === "full" ? total : round2(total * r.depositPercent / 100);
    return { n, stay, cleaning: r.cleaningFee, tax: round2(tax), discount, total, dueNow, balance: round2(total - dueNow), payMode, guests: g };
  }

  function renderSummary(msg) {
    $("out-in").textContent = state.start ? pretty(state.start) : "—";
    $("out-out").textContent = state.end ? pretty(state.end) : "—";
    const q = quote();
    const lines = $("price-lines");
    if (!q) {
      lines.innerHTML = `<p class="muted small">${msg || (state.start ? T.pickEnd : T.pickDates)}</p>`;
      $("total").textContent = "—";
      $("due-lines").innerHTML = "";
      $("submit").disabled = true;
      return;
    }
    lines.innerHTML = `
      <div class="line"><span>${T.nights(q.n)}</span><span>${eur.format(q.stay)}</span></div>
      <div class="line"><span>${T.cleaning}</span><span>${eur.format(q.cleaning)}</span></div>
      <div class="line"><span>${T.tax}</span><span>${eur.format(q.tax)}</span></div>
      ${q.discount ? `<div class="line line--discount"><span>${T.discount}</span><span>−${eur.format(q.discount)}</span></div>` : ""}`;
    $("total").textContent = eur.format(q.total);
    $("due-lines").innerHTML = q.payMode === "deposit"
      ? `<div class="line"><strong>${T.dueNow}</strong><strong>${eur.format(q.dueNow)}</strong></div>
         <div class="line muted"><span>${T.balance}</span><span>${eur.format(q.balance)}</span></div>`
      : "";
    $("submit").disabled = false;
    $("submit").textContent = q.payMode === "full" ? T.btnFull : T.btnDeposit;
  }

  // Le ricerche alimentano l'algoritmo dei prezzi nella pagina admin.
  function trackSearch() {
    if (!state.live) return;
    fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkIn: state.start, checkOut: state.end }) }).catch(() => {});
  }

  $("cal-body").addEventListener("click", e => {
    const day = e.target.closest(".day");
    if (!day || day.disabled) return;
    const d = day.dataset.date;
    let msg;
    if (!state.start || state.end || d <= state.start || !rangeIsFree(state.start, d)) {
      if (!isFree(d)) return;
      state.start = d; state.end = null;
    } else if (nightsBetween(state.start, d) < state.rules.minNights) {
      msg = T.minNights(state.rules.minNights);
    } else {
      state.end = d;
      trackSearch();
    }
    renderCalendar();
    renderSummary(msg);
  });

  $("cal-prev").addEventListener("click", () => { state.offset = Math.max(0, state.offset - 1); renderCalendar(); });
  $("cal-next").addEventListener("click", () => { state.offset = Math.min(16, state.offset + 1); renderCalendar(); });
  guests.addEventListener("change", () => renderSummary());
  form.addEventListener("change", e => { if (e.target.name === "pay") renderSummary(); });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("form-msg");
    msg.className = "form-msg";
    const q = quote();
    if (!q) return;
    if (!form.name.value.trim() || !form.email.value || !form.email.checkValidity()) {
      msg.textContent = T.missing;
      msg.classList.add("is-error");
      return;
    }
    if (!form.terms.checked) {
      msg.textContent = T.terms;
      msg.classList.add("is-error");
      return;
    }
    if (!state.live) { msg.textContent = T.offline; msg.classList.add("is-error"); return; }
    $("submit").disabled = true;
    msg.textContent = T.sending;
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: state.start, checkOut: state.end, guests: q.guests, payMode: q.payMode, lang,
          name: form.name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(),
          acceptTerms: form.terms.checked
        })
      });
      const data = await res.json();
      if (res.status === 409) throw new Error(T.unavailable);
      if (!res.ok) throw new Error(lang === "it" && data.error ? data.error : T.error);
      window.location.href = data.url;
    } catch (err) {
      msg.textContent = err.message || T.error;
      msg.classList.add("is-error");
      $("submit").disabled = false;
    }
  });

  load();
})();
