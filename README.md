# La Finestra sul Verde

Sito per la prenotazione diretta dell'appartamento *La Finestra sul Verde* a Siena.

Prima bozza: sito statico (HTML/CSS/JS, nessuna dipendenza). Per vederlo basta aprire `index.html` nel browser.

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | Pagina unica: hero, la casa, servizi, Siena, recensioni, prenotazione |
| `css/style.css` | Stile (palette verde salvia, Cormorant Garamond + Inter) |
| `js/config.js` | **Prezzi, regole e date occupate**: da modificare qui |
| `js/booking.js` | Calendario disponibilità, calcolo prezzo, scelta pagamento |
| `assets/logo.svg` | Logo: finestra ad arco con un germoglio sul davanzale |

## Da completare

- [ ] Foto reali (al posto dei riquadri verdi segnaposto)
- [ ] Prezzi reali, ospiti massimi e politica di cancellazione in `js/config.js`
- [ ] Imposta di soggiorno di Siena (importo e notti massime da verificare)
- [ ] Voto medio e recensioni reali
- [ ] Contatti, CIN/CIR, privacy e termini
- [ ] **Backend prenotazioni**:
  - sincronizzazione calendari iCal di Airbnb e Booking (import ed export, per evitare doppie prenotazioni)
  - pagamento online con Stripe Checkout
  - email di conferma all'ospite e al proprietario
- [ ] Dominio e hosting
- [ ] Versione in inglese
