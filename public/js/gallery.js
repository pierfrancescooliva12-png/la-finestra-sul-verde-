// Galleria a schermo intero: si apre cliccando una foto con data-photo, si scorre con frecce, tastiera e swipe.
(() => {
  const lang = document.documentElement.lang === "en" ? "en" : "it";
  const base = document.querySelector('script[src$="gallery.js"]').getAttribute("src").replace(/js\/gallery\.js$/, "");

  // [file, didascalia IT, didascalia EN]
  const PHOTOS = [
    ["terrazza", "La terrazza con il pergolato", "The terrace with its pergola"],
    ["terrazza-angolo", "L'angolo relax in terrazza", "The terrace lounge corner"],
    ["finestre-vista", "Le finestre sul verde", "Windows onto the green"],
    ["pranzo-soggiorno", "Zona pranzo e soggiorno", "Dining and living area"],
    ["pranzo-finestra", "La zona pranzo", "The dining area"],
    ["soggiorno", "Il soggiorno", "The living room"],
    ["cucina", "La cucina", "The kitchen"],
    ["cucina-dettaglio", "La cucina", "The kitchen"],
    ["camera-frontale", "La camera matrimoniale", "The double bedroom"],
    ["camera-finestra", "La camera matrimoniale", "The double bedroom"],
    ["camera-scala", "La camera matrimoniale", "The double bedroom"],
    ["camera-armadio", "La camera matrimoniale", "The double bedroom"],
    ["camera-ballerina", "Dettagli della camera", "Bedroom details"],
    ["bagno-doccia", "Il bagno con doccia", "The bathroom with shower"],
    ["bagno", "Il bagno", "The bathroom"],
    ["bagno-lavabo", "Il bagno", "The bathroom"],
    ["bagno-verticale", "Il bagno", "The bathroom"],
    ["ingresso", "L'ingresso", "The entrance"],
    ["ingresso-verticale", "L'ingresso", "The entrance"],
    ["scala-ingresso", "La scala d'ingresso", "The entrance staircase"],
    ["scala-ingresso-verticale", "La scala d'ingresso", "The entrance staircase"],
    ["esterno-terrazza", "La casa e la terrazza", "The house and terrace"],
    ["esterno", "La casa", "The house"],
    ["esterno-viadotto", "La casa, il viadotto e Siena", "The house, the viaduct and Siena"],
    ["esterno-viadotto-nuvoloso", "La casa e il viadotto", "The house and the viaduct"],
    ["esterno-verticale", "La casa", "The house"],
    ["panorama-colline", "Vista sulle colline e sul Monte Amiata", "View of the hills and Mount Amiata"],
    ["panorama-amiata", "Vista sulle colline e sul Monte Amiata", "View of the hills and Mount Amiata"],
    ["panorama-viadotto", "Vista sul viadotto e sulle mura di Siena", "View of the viaduct and Siena's walls"],
    ["panorama-viadotto-nuvoloso", "Vista sul viadotto e sulle mura di Siena", "View of the viaduct and Siena's walls"],
    ["drone-torre-mangia", "La casa e la Torre del Mangia", "The house and the Torre del Mangia"],
    ["drone-facciata", "La casa vista dall'alto", "The house from above"],
    ["drone-casa", "La casa vista dall'alto", "The house from above"],
    ["drone-quartiere", "La casa e il quartiere", "The house and the neighbourhood"],
    ["drone-strada", "La casa vista dall'alto", "The house from above"]
  ];
  const T = lang === "en"
    ? { close: "Close", prev: "Previous photo", next: "Next photo", of: "of" }
    : { close: "Chiudi", prev: "Foto precedente", next: "Foto successiva", of: "di" };

  const dlg = document.createElement("dialog");
  dlg.className = "lightbox";
  dlg.setAttribute("aria-label", lang === "en" ? "Photo gallery" : "Galleria fotografica");
  dlg.innerHTML = `
    <button class="lightbox__close" type="button" aria-label="${T.close}">×</button>
    <button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="${T.prev}">‹</button>
    <figure><img alt=""><figcaption></figcaption></figure>
    <button class="lightbox__nav lightbox__nav--next" type="button" aria-label="${T.next}">›</button>`;
  document.body.appendChild(dlg);
  const img = dlg.querySelector("img");
  const cap = dlg.querySelector("figcaption");
  let current = 0;

  const src = (name, w) => `${base}photos/${name}-${w}.webp`;
  function show(i) {
    current = (i + PHOTOS.length) % PHOTOS.length;
    const [name, it, en] = PHOTOS[current];
    img.src = src(name, 1600);
    img.alt = lang === "en" ? en : it;
    cap.textContent = `${lang === "en" ? en : it} · ${current + 1} ${T.of} ${PHOTOS.length}`;
    // Precarica la foto successiva per uno scorrimento fluido.
    new Image().src = src(PHOTOS[(current + 1) % PHOTOS.length][0], 1600);
  }
  function open(name) {
    const i = PHOTOS.findIndex(p => p[0] === name);
    show(i < 0 ? 0 : i);
    dlg.showModal();
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-photo]");
    if (!t) return;
    e.preventDefault();
    open(t.dataset.photo);
  });
  dlg.querySelector(".lightbox__close").onclick = () => dlg.close();
  dlg.querySelector(".lightbox__nav--prev").onclick = () => show(current - 1);
  dlg.querySelector(".lightbox__nav--next").onclick = () => show(current + 1);
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });

  // Swipe da telefono
  let x0 = null;
  dlg.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  dlg.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  document.querySelectorAll("[data-photo-count]").forEach(el => { el.textContent = PHOTOS.length; });
})();
