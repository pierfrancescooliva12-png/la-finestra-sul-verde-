// Configurazione struttura: modifica qui prezzi, regole e date occupate.
// Le date occupate in futuro arriveranno in automatico dai calendari iCal di Airbnb e Booking.
window.SITE_CONFIG = {
  currency: "EUR",
  nightlyRate: 105,         // prezzo base a notte (dom–gio)
  weekendRate: 120,          // venerdì e sabato
  cleaningFee: 0,
  extraGuestFee: 10,         // a notte, per ogni ospite oltre il secondo
  touristTaxPerPersonPerNight: 2.5, // imposta di soggiorno Siena — DA VERIFICARE con il Comune
  touristTaxMaxNights: 7,
  minNights: 1,
  maxGuests: 4,
  onlineDiscountPercent: 0,
  // Intervalli occupati: "from" = check-in, "to" = check-out (la notte del check-out resta libera)
  blockedRanges: [
    { from: "2026-11-06", to: "2026-11-09", source: "airbnb" },
    { from: "2026-11-20", to: "2026-11-23", source: "booking" },
    { from: "2026-12-24", to: "2026-12-28", source: "booking" }
  ],
  contact: {
    email: "oli.giuann@gmail.com",
    phone: "+39 000 000 0000",
    whatsapp: "390000000000"
  }
};
