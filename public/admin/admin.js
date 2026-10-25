(() => {
  const MONTHS = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  const DOW = ["lun","mar","mer","gio","ven","sab","dom"];
  const SOURCES = { direct: "Sito", airbnb: "Airbnb", booking: "Booking", block: "Bloccato" };
  const STATUS = { confirmed: "Confermata", pending: "In attesa di pagamento", cancelled: "Annullata", expired: "Scaduta" };
  const eur = n => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const fmt = s => parse(s).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const $ = id => document.getElementById(id);
  const today = iso(new Date());

  const state = {
    pass: null,
    month: `${today.slice(0, 7)}-01`,
    data: null,
    selected: new Set(),
    anchor: null,
    settingsLoaded: false
  };
  try { state.pass = sessionStorage.getItem("admin-pass"); } catch {}

  // ---------- API ----------
  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${state.pass}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) { logout(); throw new Error("Sessione scaduta"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Errore");
    return data;
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ---------- Accesso ----------
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    state.pass = e.target.password.value;
    try {
      await load();
      try { sessionStorage.setItem("admin-pass", state.pass); } catch {}
      showApp();
    } catch (err) {
      $("login-msg").textContent = "Password non corretta";
    }
  });

  function showApp() { $("login").hidden = true; $("app").hidden = false; }
  function logout() {
    try { sessionStorage.removeItem("admin-pass"); } catch {}
    state.pass = null;
    $("app").hidden = true;
    $("login").hidden = false;
  }
  $("logout").addEventListener("click", logout);

  // ---------- Schede ----------
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-selected", x === b));
    document.querySelectorAll(".panel").forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));

  // ---------- Caricamento ----------
  async function load() {
    state.data = await api(`/api/admin/overview?from=${state.month}&months=1`);
    renderStatus();
    renderCalendar();
    renderSide();
    renderBookings();
    if (!state.settingsLoaded) { fillSettings(); state.settingsLoaded = true; }
  }

  function renderStatus() {
    const d = state.data;
    const pills = [
      d.stripe ? ["ok", "Pagamenti Stripe attivi"] : ["warn", "Pagamenti in modalità demo (Stripe non configurato)"],
      d.email ? ["ok", "Email automatiche attive"] : ["warn", "Email in modalità demo (Resend non configurato)"],
      ...["airbnb", "booking"].map(k => {
        const p = d.portals[k];
        if (!d.settings[k === "airbnb" ? "icalAirbnb" : "icalBooking"]) return ["warn", `${SOURCES[k]}: calendario non collegato`];
        if (p?.error) return ["warn", `${SOURCES[k]}: errore di sincronizzazione`];
        return ["ok", `${SOURCES[k]} sincronizzato${p ? ` · ${p.count} periodi` : ""}`];
      }),
      ["", `${d.searchesLast30} ricerche sul sito negli ultimi 30 giorni`],
      [d.settings.autoPricing ? "ok" : "", d.settings.autoPricing ? "Prezzi automatici attivi" : "Prezzi automatici spenti"]
    ];
    $("status").innerHTML = pills.map(([k, t]) => `<span class="pill ${k ? `pill--${k}` : ""}">${esc(t)}</span>`).join("");
  }

  // ---------- Calendario ----------
  const heat = d => d.demand < 0.95 ? 0 : d.demand < 1.1 ? 1 : d.demand < 1.3 ? 2 : 3;

  function renderCalendar() {
    const m = parse(state.month);
    $("m-title").textContent = `${MONTHS[m.getMonth()]} ${m.getFullYear()}`;
    const el = $("acal");
    el.innerHTML = DOW.map(d => `<span class="dow">${d}</span>`).join("");
    const lead = (m.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) el.appendChild(document.createElement("span"));

    let occ = 0, free = 0;
    for (const d of state.data.days) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.date = d.date;
      const past = d.date < today;
      b.className = `cell heat-${heat(d)}${past ? " is-past" : ""}${d.occupied ? " is-occupied" : ""}${state.selected.has(d.date) ? " is-selected" : ""}`;
      const diff = d.suggested - d.price;
      const sugg = d.occupied || past ? "" :
        `<span class="cell__sugg ${diff > 0 ? "up" : diff < 0 ? "down" : ""}">sugg. ${d.suggested}${diff > 0 ? " ↑" : diff < 0 ? " ↓" : ""}</span>`;
      b.innerHTML = `
        <span class="cell__day"><span>${parse(d.date).getDate()}</span>${d.override != null ? "<span title=\"Prezzo manuale\">✎</span>" : ""}</span>
        <span class="cell__price">${d.occupied ? `<small class="muted">${SOURCES[d.occupied.type]}</small>` : eur(d.price)}</span>
        ${sugg}
        ${d.events?.length ? `<span class="cell__event" title="${esc(d.events.join(", "))}">${esc(d.events[0])}</span>` : ""}
        ${d.occupied ? `<i class="tag tag--${d.occupied.type}"></i>` : ""}`;
      el.appendChild(b);
      if (!past) d.occupied ? occ++ : free++;
    }
    const monthStr = state.month.slice(0, 7);
    const revenue = state.data.bookings
      .filter(b => b.status === "confirmed" && b.checkIn.startsWith(monthStr))
      .reduce((a, b) => a + b.quote.total, 0);
    const pct = occ + free ? Math.round(occ / (occ + free) * 100) : 0;
    $("kpi").textContent = `Occupazione notti future ${pct}% · Prenotazioni dirette ${eur(revenue)}`;
  }

  $("acal").addEventListener("click", e => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    const d = cell.dataset.date;
    if (e.shiftKey && state.anchor) {
      const [a, b] = [state.anchor, d].sort();
      for (let x = a; x <= b; x = addDays(x, 1)) state.selected.add(x);
    } else if (e.metaKey || e.ctrlKey) {
      state.selected.has(d) ? state.selected.delete(d) : state.selected.add(d);
      state.anchor = d;
    } else {
      const only = state.selected.size === 1 && state.selected.has(d);
      state.selected.clear();
      if (!only) state.selected.add(d);
      state.anchor = d;
    }
    renderCalendar();
    renderSide();
  });

  async function changeMonth(delta) {
    const m = parse(state.month);
    m.setMonth(m.getMonth() + delta);
    state.month = iso(m);
    state.selected.clear();
    await load();
  }
  $("m-prev").addEventListener("click", () => changeMonth(-1));
  $("m-next").addEventListener("click", () => changeMonth(1));

  // ---------- Pannello laterale ----------
  function renderSide() {
    const side = $("side");
    const days = state.data.days.filter(d => state.selected.has(d.date));
    if (!days.length) {
      side.innerHTML = `<p class="muted">Seleziona uno o più giorni per vedere il prezzo suggerito e modificarlo.</p>
        <p class="muted small">Il prezzo suggerito combina stagionalità di Siena, weekend, eventi (Palio, festività…), ricerche dei visitatori sul sito, occupazione del periodo e anticipo della prenotazione.</p>`;
      return;
    }
    const freeDays = days.filter(d => !d.occupied);
    const blockDays = days.filter(d => d.occupied?.type === "block");
    let head;
    if (days.length === 1) {
      const d = days[0];
      head = `
        <h3>${fmt(d.date)}</h3>
        <p class="muted small">${d.occupied ? `Occupato · ${SOURCES[d.occupied.type]}` : "Libero"}${d.searches ? ` · ${d.searches} ricerche sul sito` : ""}</p>
        <p class="big">${eur(d.price)}</p>
        <p class="small">${d.override != null ? "Prezzo impostato a mano" : state.data.settings.autoPricing ? "Prezzo automatico" : "Prezzo base"} · suggerito <strong>${eur(d.suggested)}</strong></p>
        <ul class="factors">
          <li><span>Prezzo base</span><span>${eur(state.data.settings.basePrice)}</span></li>
          ${d.factors.map(f => `<li><span>${esc(f.label)}</span><span class="${f.pct > 0 ? "pos" : "neg"}">${f.pct > 0 ? "+" : ""}${f.pct}%</span></li>`).join("")}
          <li><strong>Suggerito</strong><strong>${eur(d.suggested)}</strong></li>
        </ul>
        ${d.events?.length > 1 ? `<p class="muted small">Eventi: ${esc(d.events.join(", "))}</p>` : ""}`;
    } else {
      const avg = k => Math.round(freeDays.reduce((a, d) => a + d[k], 0) / (freeDays.length || 1));
      head = `
        <h3>${days.length} giorni selezionati</h3>
        <p class="muted small">${fmt(days[0].date)} → ${fmt(days[days.length - 1].date)} · ${freeDays.length} liberi</p>
        ${freeDays.length ? `<p class="small">Prezzo medio <strong>${eur(avg("price"))}</strong> · suggerito medio <strong>${eur(avg("suggested"))}</strong></p>` : ""}`;
    }
    side.innerHTML = `${head}
      <div class="stack">
        <p class="label">Prezzo a notte</p>
        <div class="row"><input type="number" id="price-input" min="1" step="5" placeholder="€" value="${days.length === 1 ? days[0].price : ""}"><button class="btn btn--small" id="set-price">Imposta</button></div>
        <button class="btn btn--small btn--ghost" id="use-sugg">Usa il prezzo suggerito</button>
        <button class="btn btn--small btn--ghost" id="auto-price">Torna al prezzo automatico</button>
        ${freeDays.length ? `<button class="btn btn--small btn--ghost" id="block">Blocca ${freeDays.length > 1 ? "le date libere" : "la data"}</button>` : ""}
        ${blockDays.length ? `<button class="btn btn--small btn--ghost" id="unblock">Sblocca</button>` : ""}
      </div>`;

    const dates = days.map(d => d.date);
    $("set-price").onclick = async () => {
      const v = Number($("price-input").value);
      if (!(v > 0)) return toast("Inserisci un prezzo valido");
      await api("/api/admin/prices", { method: "PUT", body: { dates, price: v } });
      toast("Prezzo aggiornato"); load();
    };
    $("use-sugg").onclick = async () => {
      const groups = {};
      days.forEach(d => (groups[d.suggested] ||= []).push(d.date));
      for (const [price, ds] of Object.entries(groups)) await api("/api/admin/prices", { method: "PUT", body: { dates: ds, price: Number(price) } });
      toast("Prezzi suggeriti applicati"); load();
    };
    $("auto-price").onclick = async () => {
      await api("/api/admin/prices", { method: "PUT", body: { dates, price: null } });
      toast("Prezzo automatico ripristinato"); load();
    };
    if ($("block")) $("block").onclick = async () => {
      await api("/api/admin/blocks", { method: "PUT", body: { dates: freeDays.map(d => d.date), blocked: true } });
      toast("Date bloccate"); load();
    };
    if ($("unblock")) $("unblock").onclick = async () => {
      await api("/api/admin/blocks", { method: "PUT", body: { dates: blockDays.map(d => d.date), blocked: false } });
      toast("Date sbloccate"); load();
    };
  }

  // ---------- Prenotazioni ----------
  function renderBookings() {
    const list = state.data.bookings;
    const table = $("bookings");
    if (!list.length) { table.innerHTML = `<tr><td class="muted">Ancora nessuna prenotazione dal sito.</td></tr>`; return; }
    table.innerHTML = `
      <tr><th>Soggiorno</th><th>Ospite</th><th>Totale</th><th>Pagato</th><th>Saldo</th><th>Stato</th><th></th></tr>
      ${list.map(b => {
        const card = b.stripe?.paymentMethod && state.data.stripe;
        return `<tr>
          <td>${fmt(b.checkIn)} → ${fmt(b.checkOut)}<small>${b.quote.nights} notti · ${b.guests} ospiti · ${b.id.slice(0, 8).toUpperCase()}</small></td>
          <td>${esc(b.name)}<small><a href="mailto:${esc(b.email)}">${esc(b.email)}</a> ${esc(b.phone)}</small></td>
          <td>${eur(b.quote.total)}<small>${b.payMode === "deposit" ? `acconto ${eur(b.quote.dueNow)}` : "tutto online"}</small></td>
          <td>${eur(b.amountPaid)}</td>
          <td>${b.balanceDue > 0 ? `<strong>${eur(b.balanceDue)}</strong>` : "—"}</td>
          <td><span class="badge badge--${b.status}">${STATUS[b.status] || b.status}</span>${b.demo ? "<small>demo</small>" : ""}</td>
          <td><div class="actions">
            ${b.status === "confirmed" && b.balanceDue > 0 ? `<button data-act="paid" data-id="${b.id}">Saldo incassato in loco</button>` : ""}
            ${b.status === "confirmed" && b.balanceDue > 0 && card ? `<button data-act="charge" data-id="${b.id}">Addebita saldo sulla carta</button>` : ""}
            ${b.status === "confirmed" && card ? `<button data-act="charge-custom" data-id="${b.id}">Addebita importo…</button>` : ""}
            ${b.status === "confirmed" ? `<button data-act="cancel" data-id="${b.id}">Annulla</button>` : ""}
          </div></td>
        </tr>`;
      }).join("")}`;
  }

  $("bookings").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const { act, id } = btn.dataset;
    const b = state.data.bookings.find(x => x.id === id);
    try {
      if (act === "paid" && confirm(`Confermi di aver incassato ${eur(b.balanceDue)} da ${b.name}?`)) {
        await api(`/api/admin/bookings/${id}/paid`, { method: "POST", body: {} });
      } else if (act === "charge" && confirm(`Addebitare ${eur(b.balanceDue)} sulla carta di ${b.name}?`)) {
        await api(`/api/admin/bookings/${id}/charge`, { method: "POST", body: { reason: "saldo" } });
      } else if (act === "charge-custom") {
        const amount = Number(String(prompt("Importo da addebitare (es. penale per mancata presentazione o danni):") || "").replace(",", "."));
        if (!(amount > 0)) return;
        const reason = prompt("Motivo dell'addebito:", "penale") || "addebito";
        await api(`/api/admin/bookings/${id}/charge`, { method: "POST", body: { amount, reason } });
      } else if (act === "cancel" && confirm(`Annullare la prenotazione di ${b.name}? Le date tornano libere. Eventuali rimborsi vanno fatti dal pannello Stripe.`)) {
        await api(`/api/admin/bookings/${id}/cancel`, { method: "POST", body: {} });
      } else return;
      toast("Fatto"); load();
    } catch (err) { toast(err.message); }
  });

  // ---------- Impostazioni ----------
  const form = $("settings-form");
  const NUM = ["basePrice", "minPrice", "maxPrice", "weekendUplift", "cleaningFee", "touristTax", "touristTaxMaxNights", "minNights", "maxGuests", "onlineDiscount", "depositPercent", "freeCancellationDays"];
  const STR = ["icalAirbnb", "icalBooking", "ownerEmail", "address", "checkinInstructions", "checkinFrom", "checkinTo", "checkoutBy"];

  function fillSettings() {
    const s = state.data.settings;
    NUM.concat(STR).forEach(k => { form.elements[k].value = s[k] ?? ""; });
    form.elements.autoPricing.checked = s.autoPricing;
    $("season").innerHTML = s.seasonality.map((v, i) => `<label>${MONTHS[i].slice(0, 3)}<input type="number" step="0.05" min="0.3" max="3" data-season="${i}" value="${v}"></label>`).join("");
    $("events").innerHTML = "";
    s.customEvents.forEach(addEventRow);
    $("ics-url").textContent = `${location.origin}/api/calendar.ics`;
    const p = state.data.portals;
    $("sync-status").textContent = Object.entries(p).map(([k, v]) => `${SOURCES[k]}: ${v.error ? `errore (${v.error})` : `aggiornato ${new Date(v.at).toLocaleString("it-IT")}`}`).join(" · ");
  }

  function addEventRow(ev = { name: "", from: "", to: "", uplift: 0.2 }) {
    const row = document.createElement("div");
    row.className = "event-row";
    row.innerHTML = `
      <label>Nome<input name="ev-name" value="${esc(ev.name)}" placeholder="es. Concerto in Piazza"></label>
      <label>Dal<input type="date" name="ev-from" value="${ev.from}"></label>
      <label>Al (ultima notte)<input type="date" name="ev-to" value="${ev.to}"></label>
      <label>Aumento %<input type="number" name="ev-uplift" step="5" value="${Math.round(ev.uplift * 100)}"></label>
      <button type="button" aria-label="Rimuovi">✕</button>`;
    row.querySelector("button").onclick = () => row.remove();
    $("events").appendChild(row);
  }
  $("add-event").addEventListener("click", () => addEventRow());

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const body = {};
    NUM.forEach(k => { body[k] = Number(form.elements[k].value); });
    STR.forEach(k => { body[k] = form.elements[k].value.trim(); });
    body.autoPricing = form.elements.autoPricing.checked;
    body.seasonality = [...document.querySelectorAll("[data-season]")].map(i => Number(i.value));
    body.customEvents = [...document.querySelectorAll(".event-row")].map(r => ({
      name: r.querySelector("[name=ev-name]").value, from: r.querySelector("[name=ev-from]").value,
      to: r.querySelector("[name=ev-to]").value, uplift: Number(r.querySelector("[name=ev-uplift]").value) / 100
    })).filter(ev => ev.from && ev.to);
    const msg = $("settings-msg");
    try {
      await api("/api/admin/settings", { method: "PUT", body });
      msg.className = "form-msg is-ok"; msg.textContent = "Impostazioni salvate";
      state.settingsLoaded = false;
      await load();
    } catch (err) {
      msg.className = "form-msg is-error"; msg.textContent = err.message;
    }
  });

  $("sync").addEventListener("click", async () => {
    try { await api("/api/admin/sync", { method: "POST" }); state.settingsLoaded = false; await load(); toast("Calendari sincronizzati"); }
    catch (err) { toast(err.message); }
  });

  // Avvio
  if (state.pass) load().then(showApp).catch(() => logout());
})();
