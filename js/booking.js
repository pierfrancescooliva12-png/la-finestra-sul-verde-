(() => {
  const cfg = window.SITE_CONFIG;
  const MONTHS = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  const DOW = ["L","M","M","G","V","S","D"];
  const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: cfg.currency });

  // Date come stringhe "YYYY-MM-DD" in ora locale, per evitare problemi di fuso.
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const nightsBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const pretty = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };

  // Notti occupate: dal check-in incluso al check-out escluso.
  const busy = new Set();
  cfg.blockedRanges.forEach(r => {
    for (let d = parse(r.from); iso(d) < r.to; d = addDays(d, 1)) busy.add(iso(d));
  });

  const today = iso(new Date());
  const state = { start: null, end: null, offset: 0 };

  const $ = id => document.getElementById(id);
  const form = $("booking-form");
  const guests = $("guests");
  for (let i = 1; i <= cfg.maxGuests; i++) guests.add(new Option(`${i} ${i === 1 ? "ospite" : "ospiti"}`, i, i === 2, i === 2));
  $("pay-online-note").textContent = `Carta, Apple Pay, Google Pay · sconto ${cfg.onlineDiscountPercent}%`;

  function rangeIsFree(a, b) {
    for (let d = parse(a); iso(d) < b; d = addDays(d, 1)) if (busy.has(iso(d))) return false;
    return true;
  }

  // Un giorno occupato può comunque essere scelto come partenza se la notte precedente è libera.
  function canBeCheckout(day) {
    return state.start && !state.end && day > state.start && rangeIsFree(state.start, day);
  }

  function renderMonth(year, month) {
    const el = document.createElement("div");
    el.className = "month";
    DOW.forEach(d => el.insertAdjacentHTML("beforeend", `<span class="dow">${d}</span>`));
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) el.appendChild(document.createElement("span"));
    const days = new Date(year, month + 1, 0).getDate();
    for (let n = 1; n <= days; n++) {
      const key = iso(new Date(year, month, n));
      const b = document.createElement("button");
      b.type = "button";
      b.className = "day";
      b.textContent = n;
      b.dataset.date = key;
      const isBusy = busy.has(key);
      if (key < today) b.disabled = true;
      else if (isBusy && !canBeCheckout(key)) { b.classList.add("is-busy"); b.disabled = true; }
      else if (isBusy) b.classList.add("is-checkout-only");
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
    $("cal-title").innerHTML = [m1, m2].map(m => `<span>${MONTHS[m.getMonth()]} ${m.getFullYear()}</span>`).join("");
    const body = $("cal-body");
    body.replaceChildren(renderMonth(m1.getFullYear(), m1.getMonth()), renderMonth(m2.getFullYear(), m2.getMonth()));
    $("cal-prev").disabled = state.offset === 0;
  }

  function quote() {
    if (!state.start || !state.end) return null;
    const nights = nightsBetween(state.start, state.end);
    let stay = 0;
    for (let d = parse(state.start); iso(d) < state.end; d = addDays(d, 1)) {
      const wd = d.getDay();
      stay += (wd === 5 || wd === 6) ? cfg.weekendRate : cfg.nightlyRate;
    }
    const g = Number(guests.value);
    const tax = Math.min(nights, cfg.touristTaxMaxNights) * g * cfg.touristTaxPerPersonPerNight;
    const online = form.pay.value === "online";
    const discount = online ? Math.round(stay * cfg.onlineDiscountPercent) / 100 : 0;
    return { nights, stay, cleaning: cfg.cleaningFee, tax, discount, total: stay + cfg.cleaningFee + tax - discount, online, guests: g };
  }

  function renderSummary(msg) {
    $("out-in").textContent = state.start ? pretty(state.start) : "—";
    $("out-out").textContent = state.end ? pretty(state.end) : "—";
    const q = quote();
    const lines = $("price-lines");
    if (!q) {
      lines.innerHTML = `<p class="muted small">${msg || (state.start ? "Ora scegli la data di partenza." : "Seleziona arrivo e partenza sul calendario.")}</p>`;
      $("total").textContent = "—";
      $("submit").disabled = true;
      return;
    }
    lines.innerHTML = `
      <div class="line"><span>${q.nights} notti</span><span>${eur.format(q.stay)}</span></div>
      <div class="line"><span>Pulizia finale</span><span>${eur.format(q.cleaning)}</span></div>
      <div class="line"><span>Imposta di soggiorno</span><span>${eur.format(q.tax)}</span></div>
      ${q.discount ? `<div class="line line--discount"><span>Sconto pagamento online</span><span>−${eur.format(q.discount)}</span></div>` : ""}`;
    $("total").textContent = eur.format(q.total);
    $("submit").disabled = false;
    $("submit").textContent = q.online ? "Prenota e paga ora" : "Prenota, pago all'arrivo";
  }

  $("cal-body").addEventListener("click", e => {
    const day = e.target.closest(".day");
    if (!day || day.disabled) return;
    const d = day.dataset.date;
    let msg;
    if (!state.start || state.end || d <= state.start || !rangeIsFree(state.start, d)) {
      if (busy.has(d)) return;
      state.start = d; state.end = null;
    } else if (nightsBetween(state.start, d) < cfg.minNights) {
      msg = `Il soggiorno minimo è di ${cfg.minNights} notti.`;
    } else {
      state.end = d;
    }
    renderCalendar();
    renderSummary(msg);
  });

  $("cal-prev").addEventListener("click", () => { state.offset = Math.max(0, state.offset - 1); renderCalendar(); });
  $("cal-next").addEventListener("click", () => { state.offset = Math.min(17, state.offset + 1); renderCalendar(); });
  guests.addEventListener("change", () => renderSummary());
  form.addEventListener("change", e => { if (e.target.name === "pay") renderSummary(); });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("form-msg");
    msg.className = "form-msg";
    const q = quote();
    if (!q) return;
    if (!form.name.value.trim() || !form.email.checkValidity() || !form.email.value) {
      msg.textContent = "Inserisci nome ed email per completare la prenotazione.";
      msg.classList.add("is-error");
      return;
    }
    const booking = {
      checkIn: state.start, checkOut: state.end, ...q,
      name: form.name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim()
    };
    // TODO backend: POST /api/bookings → verifica disponibilità, salva, blocca il calendario,
    // e se booking.online crea una sessione Stripe Checkout e reindirizza al pagamento.
    console.info("Prenotazione (bozza, nessun invio reale):", booking);
    msg.textContent = booking.online
      ? "Demo: qui verrai reindirizzato al pagamento sicuro (Stripe). Il backend non è ancora collegato."
      : `Demo: richiesta registrata per ${booking.name}. Riceveresti un'email di conferma a ${booking.email}.`;
    msg.classList.add("is-ok");
  });

  renderCalendar();
  renderSummary();
})();
