// Impostazioni predefinite, modificabili dalla pagina admin.
export const DEFAULT_SETTINGS = {
  basePrice: 105,            // prezzo base a notte per 2 ospiti, in euro
  minPrice: 90,              // l'algoritmo non suggerisce mai meno di così
  maxPrice: 300,             // ...né più di così
  weekendUplift: 15,         // % in più per le notti di venerdì e sabato
  autoPricing: true,         // se attivo, le notti senza prezzo manuale usano il prezzo suggerito
  // Stagionalità turistica di Siena, gennaio → dicembre (1 = media)
  seasonality: [0.75, 0.75, 0.85, 1.0, 1.1, 1.15, 1.2, 1.15, 1.15, 1.1, 0.85, 0.9],
  cleaningFee: 0,
  extraGuestFee: 10,         // a notte, per ogni ospite oltre il secondo
  touristTax: 2.5,           // imposta di soggiorno per persona a notte — da verificare con il Comune
  touristTaxMaxNights: 7,
  minNights: 1,
  maxGuests: 4,
  onlineDiscount: 0,         // % di sconto sul soggiorno per chi paga tutto online
  depositPercent: 20,        // acconto per chi paga in loco
  freeCancellationDays: 7,
  icalAirbnb: "",
  icalBooking: "",
  customEvents: [],          // [{ name, from, to, uplift }]
  checkinFrom: "16:00",
  checkinTo: "22:00",
  checkoutBy: "10:00",
  ownerEmail: "",
  address: "",
  checkinInstructions: ""
};

// Listino deciso dal proprietario (ottobre 2026): si applica una volta sopra le impostazioni
// già salvate, poi resta modificabile dall'admin.
const PRICING_VERSION = 2;
const PRICING_V2 = { basePrice: 105, minPrice: 90, maxPrice: 300, minNights: 1, cleaningFee: 0, onlineDiscount: 0, extraGuestFee: 10 };

export function mergeSettings(saved) {
  const s = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  if (saved && (saved.pricingVersion || 1) < PRICING_VERSION) Object.assign(s, PRICING_V2);
  s.pricingVersion = PRICING_VERSION;
  return s;
}

// Regole pubbliche, esposte al sito (niente dati riservati).
export function publicRules(s) {
  return {
    minNights: s.minNights,
    maxGuests: s.maxGuests,
    cleaningFee: s.cleaningFee,
    extraGuestFee: s.extraGuestFee,
    includedGuests: 2,
    touristTax: s.touristTax,
    touristTaxMaxNights: s.touristTaxMaxNights,
    onlineDiscount: s.onlineDiscount,
    depositPercent: s.depositPercent,
    freeCancellationDays: s.freeCancellationDays
  };
}
