# 07 – Strekkodeskanning (fase 7)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-22 («godkjent»). Anbefalingene i de åpne
spørsmålene gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før implementeringen. Ikke gjennomgått av
Linus Saxe Huseby.

**Bygger på:** FR-SCAN-001–002, NFR-REL-001, NFR-SEC-001/002/004, NFR-DATA-002 og NFR-UX-001–004 i
[00-kravoversikt.md](00-kravoversikt.md), samt ADR-0006, ADR-0008, [ADR-0014](../architecture-decisions/0014-produkter-og-strekkoder.md)
og vilkårene i [integrations/open-food-facts.md](../integrations/open-food-facts.md).

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Datamodell | Globalt mellomlager for Open Food Facts og husholdningens egne strekkoder (ADR-0014) |
| 2 | Dato | Alltid tom. OFF vet ikke hva som står på akkurat din pakke. Datotype og sted hentes fra forrige gang. |
| 3 | Huke av på handlelisten ved skanning | Utsatt |
| 4 | Kontakt i User-Agent | Ikke valgt per 2026-10-22. Uten `OFF_USER_AGENT` er oppslag slått av. |
| 5 | Behandlingsansvarlig for testmiljøet | Studentene (Ferdinand Risan og Linus Saxe Huseby). Serveren står i Tyskland og driftes av Ferdinand. |
| 6 | Domene for testmiljøet | `smartmat.risansolutions.no` (DNS ikke satt opp per 2026-10-22) |

## Begreper

| Begrep | Betydning |
|---|---|
| **GTIN** | Varens nummer bak strekkoden. Lagres som 8 sifre (EAN-8), 13 sifre (EAN-13 og UPC-A med 0 foran) eller 14 sifre. |
| **Produkt** (`product`) | Det OFF vet om en GTIN: navn, merke, pakningsstørrelse, kategori. Globalt mellomlager, ingen husholdningsdata. |
| **Husholdningens strekkode** (`household_barcode`) | Det husholdningen bekreftet sist for en GTIN: navn, kategori, enhet, mengde, ingrediens, sted, datotype og varen den ble lagt på. Vinner over OFF. |
| **Butikkens egen kode** | Koder med prefiks 02, 04 eller 20–29 (EAN-13) eller 0/2 (EAN-8). Brukes for vekt- og prisvarer og interne koder. Hver pakke har sin egen kode. |

## Krav og akseptansekriterier

### FR-SCAN-001 Skanne med kameraet
- Siden `/skann` har en knapp «Start kamera». Kameraet startes aldri av seg selv.
- Nettleserens innebygde `BarcodeDetector` brukes når den finnes og kan lese EAN-13. Ellers lastes en reserve
  (`barcode-detector`, MIT, bygger på `zxing-wasm`). Reserven og wasm-filen lastes bare når kameraet startes, og
  wasm-filen kommer fra vår egen server.
- Formater: EAN-13, EAN-8, UPC-A og UPC-E.
- **Bildene forlater aldri nettleseren.** Bare den leste strekkoden sendes til API-et.
- Kameraet stoppes når en kode er lest, når brukeren trykker «Stopp», forlater siden eller bytter fane.
- **Tilstander, med egen tekst:**

  | Tilstand | Når |
  |---|---|
  | `unsupported` | Nettleseren har ikke `getUserMedia` |
  | `insecure` | Siden er ikke åpnet over HTTPS eller localhost |
  | `denied` | Brukeren eller nettleseren nektet kameratilgang |
  | `noCamera` | Fant ikke noe kamera |
  | `failed` | Annen feil (for eksempel at reserven ikke kunne lastes) |
  | `scanning` | Kameraet går og leter |

  I alle feiltilstandene står det at man kan skrive inn koden i stedet.

### FR-SCAN-003 Skrive inn strekkoden selv
- Feltet for strekkoden vises alltid, også når kameraet går.
- Mellomrom og bindestreker fjernes. Ellers er bare sifre lov.
- Godtatte lengder: 8 (EAN-8), 12 (UPC-A), 13 (EAN-13) og 14 (GTIN-14). Kontrollsifferet må stemme (modulus 10,
  vekter 3 og 1 fra høyre).
- **Normalisering:** UPC-A får 0 foran (13 sifre). GTIN-14 som begynner med 0, blir de 13 siste sifrene. UPC-E
  utvides bare når kameraet har meldt formatet `upc_e`. Åtte sifre som skrives inn, regnes som EAN-8.
- Samme regler i nettleseren og på serveren (`packages/shared/src/barcode/gtin.ts`). En ugyldig kode gir 400 med
  feltfeil `gtin`.
- Koden står i URL-en (`/skann?kode=7038010000737`), slik at siden kan lastes på nytt.

### FR-SCAN-002 Oppslag og forhåndsutfylt skjema
- **Rekkefølge for oppslaget:**
  1. Butikkens egen kode slås ikke opp: «Butikkens egen kode. Fyll inn selv.» Den huskes heller ikke.
  2. Husholdningens strekkode, hvis den finnes. OFF spørres da ikke.
  3. Mellomlageret: treff yngre enn 30 dager, «fant ingenting» yngre enn 24 timer.
  4. Open Food Facts.
- **Fra OFF fylles ut:** navn (norsk navn først, så navnet på produktets språk, så engelsk), merke (vises, lagres
  ikke på varen), mengde og enhet fra pakningsstørrelsen (g eller ml, rundet til heltall), og kategori fra
  `categories_tags` når en tagg står i oversettelsestabellen (`packages/shared/src/barcode/offCategories.ts`, KI-utkast).
  Uten treff i tabellen må brukeren velge kategori.
- **Fra husholdningens strekkode fylles ut:** navn, kategori, enhet, mengde, ingrediensvalg, sted og datotype.
- **Datoen er alltid tom.** Sted er forrige sted, ellers det første stedet (som i «Legg til vare»).
- Finnes varen fra forrige gang fortsatt, foreslår skjemaet «Nytt parti på ‹navn›» (FR-INV-002), med «Ny vare» som
  alternativ.
- **Ingrediens:** skjemaet viser hva navnet kobles til automatisk (regler fra fase 5), og brukeren kan velge en annen
  eller «Ikke en ingrediens». Valget lagres på varen og huskes for strekkoden.
- **Kreditering:** skannesiden viser alltid «Produktdata fra Open Food Facts (ODbL)» med lenke.

### FR-SCAN-004 Ukjent strekkode
- «Fant ingenting» og «tjenesten svarer ikke» gir det samme tomme skjemaet, med ulik tekst:
  «Vi fant ikke denne strekkoden. Fyll inn selv, så husker vi den til neste gang.» og
  «Produktoppslaget svarer ikke akkurat nå. Fyll inn selv.»
- Når brukeren bekrefter, huskes svarene for husholdningen (ikke for butikkens egne koder).

### FR-SCAN-005 Bekreftelse
- Ingenting lagres før brukeren trykker «Legg i matlageret».
- Vare (eller nytt parti), hendelsen `add` og husholdningens strekkode lagres i én transaksjon
  (`insertBatchWithEvent`).
- **Dobbel innsending:** skjemaet sender en tilfeldig `clientRequestId`, som lagres som `dedupe_key` på partiet
  (unik per husholdning). Kommer den igjen, svarer API-et 200 med varen, uten nytt parti.
- Nytt parti på en vare krever at varen finnes i husholdningen (ellers 404) og at enheten er den samme.
- Etter bekreftelsen blir brukeren på skannesiden, klar for neste vare, og får en melding med lenke til varen.

### NFR-REL-001 Når OFF er nede
- Tidsavbrudd etter 3 sekunder. Feil, ugyldig svar, HTTP 5xx, 429 og serverens egen grense gir «tjenesten svarer ikke»
  og det manuelle skjemaet. Ingenting av dette lagres i mellomlageret.
- Matlager, budsjett, oppskrifter og handleliste bruker ikke OFF.

## Grenser (rate limiting)
- **Per bruker:** 30 oppslag i minuttet (`GET …/barcodes/:gtin`), deretter 429.
- **Mot OFF:** høyst 10 oppslag i minuttet for hele serveren (OFF tillater 15 per IP). Over grensen svarer API-et
  «tjenesten svarer ikke».

## Sikkerhet og personvern
- Begge endepunktene ligger under `/households/:householdId/` med `requireAuth` og `householdAccess`. Fremmed
  husholdning gir 404. Varen og stedet i forespørselen hentes med `householdId`.
- `household_barcodes` har sammensatte fremmednøkler `(item_id, household_id)` og `(location_id, household_id)`.
  Når en vare eller et sted slettes, tømmer koden koblingen først.
- Mellomlageret (`products`, `product_lookup_misses`) har ingen data om brukere eller husholdninger.
- Strekkoden valideres før noe sendes til OFF, så det går aldri fritekst til en ekstern tjeneste.
- Tekst fra OFF vises som ren tekst. Svaret valideres med Zod, og navn kuttes til 100 tegn.
- Strekkoder og produktnavn kommer ikke i loggene.
- Kamerabildene behandles bare i nettleseren.

## API
Se [api-documentation.md](../api-documentation.md).

## Avvik og tillegg under implementeringen

- **`ProductBarcode` ble ikke laget.** OFF har én kode per produkt, så `products` har GTIN som primærnøkkel. «Fant
  ingenting» ligger i en egen tabell, `product_lookup_misses`.
- **Et gammelt treff brukes når OFF er nede.** Det står ikke i kravet over, men gir et bedre svar enn et tomt skjema.
- **Strekkoden logges ikke.** Fastify logget URL-en med koden. Nå står det `/barcodes/[gtin]`.
- **Skjermen etter bekreftelse:** meldingen «… er lagt i matlageret» har en lenke «Se varen», og siden er klar for
  neste vare.
- **Testmiljøet** (ADR-0015) ble bygd i samme fase: innstillinger, Docker-oppsett, kontoskript og banner. Det er ikke
  satt opp på serveren.

## Utenfor fasen
Huke av på handlelisten ved skanning, strekkoder på kjøpslinjer, bilder av produktet, allergener fra OFF,
«glem strekkoden», og deling av mellomlageret.

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-7).
