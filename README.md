# La Finestra sul Verde

Sito di prenotazione diretta per l'appartamento *La Finestra sul Verde* a Siena, in italiano e in inglese, con:

- calendario disponibilità sincronizzato con **Airbnb e Booking** (iCal, nei due sensi);
- pagamento **online completo** (con sconto) oppure **acconto + carta a garanzia** e saldo all'arrivo, tramite **Stripe**;
- **email automatiche** di conferma all'ospite (IT/EN) e di notifica al proprietario, tramite **Resend**;
- **pagina admin** (`/admin`) con calendario, **prezzi suggeriti dall'algoritmo**, prezzi manuali, blocco date, gestione prenotazioni (saldo, addebiti sulla carta, annullamenti) e impostazioni.

## Struttura

| Percorso | Contenuto |
|---|---|
| `public/` | Sito pubblico: `index.html` (IT), `en/` (EN), `conferma.html`, `admin/` |
| `public/js/booking.js` | Calendario e modulo di prenotazione (bilingue) |
| `public/js/config.js` | Dati dimostrativi usati solo se il backend non risponde |
| `lib/api.mjs` | Tutte le API (disponibilità, checkout, webhook Stripe, admin) |
| `lib/pricing.mjs` + `lib/events.mjs` | Algoritmo dei prezzi suggeriti ed eventi di Siena |
| `lib/ical.mjs` | Import/export calendari iCal |
| `lib/stripe.mjs`, `lib/email.mjs` | Pagamenti ed email |
| `netlify/functions/api.mjs` | Funzione Netlify che espone `lib/api.mjs` su `/api/*` |
| `dev/server.mjs` | Server per provarlo in locale |

## Provarlo in locale

```bash
npm install
npm run dev        # http://localhost:8888  ·  admin: http://localhost:8888/admin/  (password: admin)
npm test
```

Senza chiavi Stripe e Resend il sito funziona in **modalità demo**: le prenotazioni vengono confermate senza pagamento e le email sono scritte solo nel log.

## Come funziona l'algoritmo dei prezzi

Prezzo suggerito = prezzo base × fattori, arrotondato a 5 € e compreso tra il minimo e il massimo impostati:

| Fattore | Effetto |
|---|---|
| Stagionalità di Siena | da −25% (gennaio) a +20% (luglio), modificabile mese per mese |
| Weekend | venerdì e sabato +15% (modificabile) |
| Eventi e festività | Palio di luglio e agosto +80%, Capodanno +40%, Pasqua +30%, ponti, L'Eroica, Natale… più gli eventi aggiunti dall'admin |
| Ricerche sul sito | ogni ricerca di date viene registrata; le notti più cercate degli ultimi 30 giorni salgono fino a +15%, quelle ignorate scendono fino a −8% (si attiva dopo 20 ricerche) |
| Occupazione del periodo | se almeno 4 notti su 6 vicine sono occupate (anche da Airbnb/Booking) +10% |
| Notte isolata | una notte libera tra due prenotazioni −15% |
| Anticipo | data entro 3 giorni −15%, entro 10 giorni −7%, oltre 5 mesi +5% |

Con **Prezzi automatici** attivo, le notti senza prezzo manuale usano direttamente il prezzo suggerito. Altrimenti si usa il prezzo base (+ weekend) e i suggerimenti restano solo indicativi.

Per dati di mercato esterni (prezzi dei concorrenti, occupazione della città) si può integrare in futuro un servizio come PriceLabs o AirDNA.

## Messa online (Netlify)

1. Crea un account su [Netlify](https://www.netlify.com) e importa questo repository (impostazioni già in `netlify.toml`).
2. In *Site configuration → Environment variables* imposta le variabili di `.env.example` (almeno `ADMIN_PASSWORD`).
3. **Stripe**: crea l'account su [stripe.com](https://stripe.com), copia la chiave segreta in `STRIPE_SECRET_KEY`. In *Developers → Webhooks* aggiungi l'endpoint `https://TUO-SITO/api/stripe/webhook` con gli eventi `checkout.session.completed` e `checkout.session.expired`, e copia il segreto in `STRIPE_WEBHOOK_SECRET`.
4. **Resend**: crea l'account su [resend.com](https://resend.com), verifica il dominio, imposta `RESEND_API_KEY` ed `EMAIL_FROM`.
5. **Calendari**: nella pagina admin → Impostazioni incolla i link iCal di Airbnb e Booking. Copia poi il link `…/api/calendar.ics` mostrato lì e importalo su Airbnb e su Booking.
6. Nella pagina admin imposta prezzi, acconto, regole, email per le notifiche, indirizzo e istruzioni di arrivo.

## Da completare

- [ ] Foto reali (al posto dei riquadri verdi segnaposto)
- [ ] Prezzi definitivi (dalla pagina admin)
- [ ] Imposta di soggiorno di Siena (importo e notti massime da verificare)
- [ ] Voto medio e recensioni reali
- [ ] Completare i campi tra [ ] in `public/termini.html`, `public/privacy.html` e nelle versioni inglesi (gestore, CIN, telefono, penale per mancata presentazione, animali), poi farli verificare da un consulente
- [ ] Contatti e CIN nel footer del sito
- [ ] Dominio
