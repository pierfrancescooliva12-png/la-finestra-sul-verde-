// Calcolo del preventivo. La stessa formula è replicata in public/js/booking.js
// per mostrare il totale in tempo reale: il server ricalcola sempre prima di incassare.
export function computeQuote({ prices, guests, payMode, rules }) {
  const nights = prices.length;
  const extra = nights * Math.max(0, guests - rules.includedGuests) * rules.extraGuestFee;
  const stay = prices.reduce((a, b) => a + b, 0) + extra;
  const tax = Math.min(nights, rules.touristTaxMaxNights) * guests * rules.touristTax;
  const discount = payMode === "full" ? Math.round(stay * rules.onlineDiscount) / 100 : 0;
  const total = round2(stay + rules.cleaningFee + tax - discount);
  const dueNow = payMode === "full" ? total : round2(total * rules.depositPercent / 100);
  return { nights, stay, extra, cleaning: rules.cleaningFee, tax: round2(tax), discount, total, dueNow, balance: round2(total - dueNow) };
}

const round2 = n => Math.round(n * 100) / 100;
