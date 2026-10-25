// Impostazioni predefinite, modificabili dalla pagina admin.
// I prezzi sono segnaposto: vanno decisi dal proprietario.
export const DEFAULT_SETTINGS = {
  basePrice: 100,            // prezzo base a notte, in euro
  minPrice: 70,              // l'algoritmo non suggerisce mai meno di così
  maxPrice: 260,             // ...né più di così
  weekendUplift: 15,         // % in più per le notti di venerdì e sabato
  autoPricing: true,         // se attivo, le notti senza prezzo manuale usano il prezzo suggerito
  // Stagionalità turistica di Siena, gennaio → dicembre (1 = media)
  seasonality: [0.75, 0.75, 0.85, 1.0, 1.1, 1.15, 1.2, 1.15, 1.15, 1.1, 0.85, 0.9],
  cleaningFee: 35,
  touristTax: 2.5,           // imposta di soggiorno per persona a notte — da verificare con il Comune
  touristTaxMaxNights: 7,
  minNights: 2,
  maxGuests: 4,
  onlineDiscount: 5,         // % di sconto sul soggiorno per chi paga tutto online
  depositPercent: 20,        // acconto per chi paga in loco
  freeCancellationDays: 7,
  icalAirbnb: "",
  icalBooking: "",
  customEvents: [],          // [{ name, from, to, uplift }]
  checkinFrom: "16:00",
  checkinTo: "22:00",
  checkoutBy: "10:00",       // DA CONFERMARE
  ownerEmail: "",
  address: "",
  checkinInstructions: ""
};

export function mergeSettings(saved) {
  return { ...DEFAULT_SETTINGS, ...(saved || {}) };
}

// Regole pubbliche, esposte al sito (niente dati riservati).
export function publicRules(s) {
  return {
    minNights: s.minNights,
    maxGuests: s.maxGuests,
    cleaningFee: s.cleaningFee,
    touristTax: s.touristTax,
    touristTaxMaxNights: s.touristTaxMaxNights,
    onlineDiscount: s.onlineDiscount,
    depositPercent: s.depositPercent,
    freeCancellationDays: s.freeCancellationDays
  };
}
