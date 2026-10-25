// Home: menu che diventa pieno allo scorrimento, puntini del carosello, comparsa morbida delle sezioni.
(() => {
  document.documentElement.classList.add("js");

  const nav = document.querySelector(".nav--overlay");
  const onScroll = () => nav.classList.toggle("is-solid", window.scrollY > window.innerHeight * 0.6);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const track = document.querySelector(".strip__track");
  const dots = document.querySelector(".strip__dots");
  if (track && dots) {
    const items = [...track.children];
    dots.innerHTML = items.map(() => "<i></i>").join("");
    const update = () => {
      const center = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      items.forEach((li, i) => {
        if (Math.abs(li.offsetLeft + li.offsetWidth / 2 - center) < Math.abs(items[best].offsetLeft + items[best].offsetWidth / 2 - center)) best = i;
      });
      [...dots.children].forEach((d, i) => d.classList.toggle("is-on", i === best));
    };
    track.addEventListener("scroll", update, { passive: true });
    update();
  }

  const targets = document.querySelectorAll(".section__head, .intro__text, .card, .review, .split > *, .faq__list, .panorama__quote, .amenities");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    targets.forEach(t => { t.classList.add("reveal"); io.observe(t); });
  }
})();
