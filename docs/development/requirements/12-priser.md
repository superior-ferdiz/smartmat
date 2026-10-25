# 12 – Priser (fase 12)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-25 («Godkjennt»). De sju åpne spørsmålene ble ikke
besvart enkeltvis, så anbefalingene i planen gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før
implementeringen. Ikke gjennomgått av Linus Saxe Huseby.

**Bygger på:** FR-BUD-002, FR-SCAN-002, FR-SHOP-001, NFR-REL-001, NFR-SEC-001/002/004, NFR-DATA-001 og
NFR-UX-001–004 i [00-kravoversikt.md](00-kravoversikt.md), ADR-0006, ADR-0007, ADR-0010, ADR-0014 og
[ADR-0020](../architecture-decisions/0020-priser-fra-kassalapp-som-anslag.md). Vilkårene er lest og dokumentert i
[integrations/kassalapp.md](../integrations/kassalapp.md).

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Bruke Kassalapp | Ja, på Hobby (gratis, ikke-kommersielt), og **av som standard**: uten `KASSALAPP_API_KEY` spørres Kassalapp aldri. Egne priser bygges uansett (ADR-0020). |
| 2 | Lagring | Bare siste observasjon per kjede og strekkode. Et oppslag gjelder i 6 timer. Rader som ikke er hentet på 30 dager, slettes. |
| 3 | Fritekstsøk hos Kassalapp | Nei. Bare strekkoder sendes. |
| 4 | Gamle priser fra Rema 1000, Kiwi og Coop | Vises sammenfoldet under «Eldre priser» med dato, men aldri i «billigst» eller i anslaget. |
| 5 | Partipris fra Kassalapp ved skanning | Nei. Partiets pris er det brukeren har betalt eller skrevet inn. |
| 6 | Gamle egne priser | Datoen vises alltid. Priser eldre enn 90 dager merkes. |
| 7 | Anslaget på handlelisten | Egne priser først, så ferske Kassalapp-priser som allerede ligger lagret. Listen gjør ingen nye kall. |
| 8 | Plassholderne i prompten | Gjennomgang siden fase 11: ingen. Ordlyden i varslene: ikke lest ennå. Kapittel 12 og reglene fra fase 10: ikke vurdert ennå. Art. 9: ikke vurdert ennå. Kontroll av oppskriftene: ingen ennå. ADR-0017: ikke godkjent ennå. Konto og nøkkel hos Kassalapp: har vi ikke. |

## Begreper

| Begrep | Betydning |
|---|---|
| **Egen pris** | Det husholdningen har ført som pris på et parti: fra en kjøpslinje («Fra kjøp») eller skrevet inn på varen («Ført på varen»). Regnes ut ved hver lesing, lagres ikke på nytt. |
| **Ekstern pris** | En prisobservasjon fra Kassalapp for én kjede: pris for pakken, når Kassalapp sist sjekket den, og pakningsstørrelse når den er kjent |
| **Observasjonstidspunkt** | Kassalapps `current_price.date`: når prisen sist ble kontrollert (ikke når vi hentet den) |
| **Gammel pris** | En ekstern pris som er kontrollert for mer enn 14 dager siden (Kassalapps egen grense) |
| **Kjede som ikke hentes** | Rema 1000, Kiwi og Coop. Kassalapp henter ikke prisene deres. Kjedekoder: `REMA_1000`, `KIWI` og alt som begynner med `COOP`. |
| **Fersk pris** | En ekstern pris som verken er gammel eller fra en kjede som ikke hentes |
| **Enhetspris** | Øre per kg, per liter eller per stykk, regnet med heltall fra pris og mengde |
| **Anslag** | En pris som ikke er betalt. Blir aldri et kjøp, en utgift eller en partipris (ADR-0007). |

## Regler (rene funksjoner i `packages/shared/src/prices/rules.ts`)

- **Enhetspris** `unitPriceOre(priceOre, quantityBase, unit)`: gram gir øre per kg (`pris × 1000 / mengde`), ml gir
  øre per liter, stk gir øre per stykk (`pris / antall`). Rundes **halvt opp** til hele øre med `BigInt`, som
  svinnverdien (FR-INV-007). Mengde 0 eller mangler gir ingen enhetspris.
- **Andel av en pris** `scalePriceOre(priceOre, wanted, packageQuantity)`: `pris × ønsket / pakke`, halvt opp.
- **Kroner fra Kassalapp til øre** `kronerToOre(kroner)`: Kassalapp sender kroner som JSON-tall (`72.9`). Det er det
  eneste stedet et flyttall kommer inn. Tallet ganges med 100 og rundes, men bare når det har høyst to desimaler
  (avviket fra et helt øretall er under en milliondel). Negative tall, mer enn to desimaler, over 100 000 kr og alt
  som ikke er et endelig tall er ugyldig.
- **Gammel pris** `isStalePrice(observedAt, now)`: eldre enn 14 dager (14 × 24 timer). Akkurat 14 dager er fersk.
- **Gammel egen pris** `isOldOwnPrice(date, today)`: mer enn 90 dager før i dag (norsk dato).
- **Billigst** `cheapestFresh(observations)`: laveste pris blant ferske priser. Lik pris gir kjeden som kom først
  alfabetisk. Ingen ferske priser gir ingen «billigst».
- **Anslaget på handlelisten:** `estimateLine` gir anslaget for én linje (reglene under FR-PRICE-003), og
  `summarizeEstimates` summerer bare linjer som har et anslag, og teller hvor mange som har det og hvor de kommer fra.
  En linje uten pris er ukjent og teller aldri som 0.

## Krav og akseptansekriterier

### FR-PRICE-001 Pris på en skannet vare
- På skannesiden lastes prisene **etter** produktoppslaget (`GET /households/:householdId/prices/:gtin`), så skjemaet
  ikke venter på dem.
- **Eksterne priser** vises i en tabell med kjede, pris, enhetspris (når pakningsstørrelsen er kjent) og «sjekket
  ‹dato›». Ferske priser står først, sortert etter pris. Gamle priser og kjeder som ikke hentes står sammenfoldet
  under «Eldre priser», med dato og forklaring.
- Teksten sier **alltid** at prisene gjelder kjeden og ikke butikken, at tilbud og medlemspriser ikke er med, og at
  Rema 1000, Kiwi og Coop ikke er med.
- Tilstander med egen tekst: `off` (eksterne priser er slått av), `notAsked` (butikkens egen kode), `notFound`,
  `unavailable` (tjenesten svarer ikke) og `found` uten priser («Ingen kjeder har pris på denne varen»).
- Når Kassalapp ikke svarer, men vi har en lagret observasjon fra de siste 30 dagene, vises den med datoen, og
  teksten sier at prisene kan være utdaterte.
- **Kreditering:** «Priser fra Kassalapp» med lenke til kassal.app (ikke påkrevd, men ADR-0010 krever kilde).

### FR-PRICE-002 Egne priser
- Kommer fra partier med pris (også partier som er brukt opp), nyeste først, høyst 10.
- Hver rad viser dato (kjøpsdato, ellers datoen partiet ble lagt inn), pris, mengde, enhetspris, og om prisen er «Fra
  kjøp» (med butikk og lenke til kjøpet) eller «Ført på varen».
- Priser eldre enn 90 dager får merket «Over 3 måneder gammel».
- **Skannesiden:** egne priser for varen strekkoden sist ble lagt på (`household_barcodes.item_id`).
- **Varesiden:** egne priser for varen, og eksterne priser når varen har en strekkode i `household_barcodes`.
- Egne og eksterne priser står i hver sin seksjon med hver sin overskrift. De blandes aldri i samme tabell.

### FR-PRICE-003 Anslått pris på handlelisten
- `GET /households/:householdId/shopping-list/price-estimate`. Gjelder bare åpne linjer.
- **Hvilken vare en linje svarer til:** varer i husholdningen med samme ingrediens (manuell kobling eller navnet,
  reglene fra fase 5). Har linjen ingen ingrediens, brukes varer med nøyaktig samme navn (uten forskjell på store og
  små bokstaver).
- **Egen pris først:** det nyeste partiet med pris blant disse varene.
  - Har linjen mengde i samme grunnenhet som varen: `scalePriceOre(partiets pris, linjens mengde, partiets mengde)`
    («regnet ut fra mengden»).
  - Har linjen ingen mengde: hele partiets pris («som sist»).
  - Annen enhet: ingen egen pris for linjen.
- **Deretter Kassalapp:** strekkoder husholdningen har lagt på disse varene, og ferske observasjoner som allerede er
  lagret. Den nedre medianen av de ferske prisene brukes (med to kjeder: den billigste), så én dyr eller billig kjede
  ikke styrer anslaget. Mengden skaleres med pakningsstørrelsen, og
  uten mengde brukes én pakke. Listen sender **ingen** nye forespørsler til Kassalapp.
- Svar per linje: anslag i øre, kilde (`own` eller `kassalapp`), grunnlag (`scaled`, `lastTime` eller `onePackage`)
  og dato. Uten anslag: årsak (`noMatch`, `noPrice` eller `unitMismatch`).
- Kortet viser «Anslag for X av Y linjer: ca. Z kr», hvor mange som mangler pris, og hvor mange som er fra egne kjøp og
  fra Kassalapp. Det står aldri «Totalt» eller «Handlelisten koster». Uten noen anslag: «Ingen av linjene har pris
  ennå».

### FR-PRICE-004 «Billigst sist observert hos»
- Vises bare når minst én fersk pris finnes: «Billigst sist observert: ‹kjede›, ‹pris› (sjekket ‹dato›)» og «av N
  kjeder med fersk pris».
- Gamle priser og kjeder som ikke hentes er aldri med.

### FR-PRICE-005 Et anslag er ikke en utgift (ADR-0007)
- Ingen ekstern pris skrives til kjøp, kjøpslinjer, partier, budsjettet eller svinnverdien. API-testene sjekker at
  disse tabellene er uendret etter prisoppslag.
- Skjemaet på skannesiden fylles ikke ut med pris fra Kassalapp.

### FR-PRICE-006 Kilde og dato
- Hver ekstern pris har kilde (`kassalapp`), observasjonstidspunkt og tidspunktet vi hentet den. Hver egen pris har
  dato og opphav. Dette lagres eller regnes ut og vises alltid.

### NFR-REL-001 Når Kassalapp er nede eller mangler nøkkel
- Uten `KASSALAPP_API_KEY` er provideren slått av (`off`), og ingen forespørsel sendes.
- Tidsavbrudd etter 3 sekunder. Nettverksfeil, HTTP 5xx, 401/403, 429, ugyldig JSON, feil format og for store svar
  (over 1 000 000 tegn) gir `unavailable`. Ingenting av dette lagres.
- **429:** serveren sender ingen nye forespørsler før tiden i `Retry-After` er gått (sekunder eller HTTP-dato, høyst
  én time; 60 sekunder når hodet mangler).
- Egne priser vises alltid, også når de eksterne mangler.

## Grenser (rate limiting)
- **Mot Kassalapp:** høyst 30 forespørsler i minuttet for hele serveren (`KASSALAPP_MAX_PER_MINUTE`, høyst 60, som er
  Kassalapps grense per konto). Over grensen: `unavailable`, uten forespørsel.
- **Per bruker:** 30 eksterne oppslag i minuttet (`PRICE_LOOKUPS_PER_MINUTE`). Over grensen: eksterne priser er
  `unavailable`, men egne priser vises. Siden svarer ikke 429, fordi egne priser ikke skal forsvinne.
- **Hurtiglager:** et svar (også «fant ingenting») gjelder i 6 timer for hele serveren.

## Svarformat fra Kassalapp (`GET /api/v1/products/ean/{ean}`)
- Vi leser `data.products[]` og, for hver: `store.code`, `store.name`, `current_price.price`,
  `current_price.date`, `weight`, `weight_unit` og `kassalapp.url`.
- `store` og `current_price` godtas både som objekt (eksempelet i dokumentasjonen) og som liste (OpenAPI-filen).
  Fra en liste brukes første element.
- En oppføring uten kjede, uten pris eller med ugyldige verdier hoppes over. Flere oppføringer fra samme kjede gir den
  med nyest dato (lik dato: lavest pris).
- Kjedekoden må være store bokstaver, sifre og `_` (høyst 40 tegn). Kjedenavnet renses og kuttes til 60 tegn.
- Lenken lagres bare når den er `https://kassal.app/…`. Ellers lenkes det til forsiden.
- Pakningsstørrelse: `weight` med `g`, `kg`, `ml`, `cl`, `dl`, `l` eller `stk`/`piece` blir heltall i grunnenhet.
  Annet gir ingen pakningsstørrelse.
- Et observasjonstidspunkt mer enn ett døgn fram i tid er ugyldig, og oppføringen hoppes over.
- **Ikke sett i et ekte svar** (teamet har ingen nøkkel per 2026-10-25). Formatet sjekkes med ett manuelt oppslag når
  nøkkelen finnes.

## Datamodell
- `price_observations` (global, ingen husholdningsdata): `source`, `gtin`, `chain_code`, `chain_name`, `price_ore`,
  `package_quantity_base`, `package_unit`, `observed_at`, `fetched_at`, `source_url`. Unik på
  `(source, gtin, chain_code)`. CHECK: GTIN med 8, 13 eller 14 sifre, pris 0–10 000 000 øre, pakningsstørrelse
  positiv og enten begge eller ingen av mengde og enhet.
- `price_lookups` (global): `(source, gtin)` som primærnøkkel, `fetched_at` og `found`.
- Et nytt svar erstatter alle observasjoner for strekkoden i én transaksjon.
- **Sletting:** workeren sletter oppslag og observasjoner som ikke er hentet på 30 dager (samme jobb som
  kvitteringene, hvert 15. minutt).
- Egne priser lagres ikke på nytt. De leses fra `inventory_batches` (`price_ore`, `initial_quantity_base`,
  `purchased_on`, `purchase_line_id`) og slettes med partiene.

## Sikkerhet og personvern
- Alle tre endepunktene ligger under `/households/:householdId/` med `requireAuth` og `householdAccess`. En annen
  husholdning gir 404. Varen i `/items/:itemId/prices` slås opp med `household_id` (404).
- Strekkoden valideres med `gtinSchema` (kontrollsiffer). Butikkens egne koder sendes aldri til Kassalapp.
- **Til Kassalapp:** bare GTIN-en og API-nøkkelen, fra serveren. Ingen IP-adresse, cookie, husholdning, navn,
  fritekst eller egne priser.
- **Nøkkelen** sendes bare til `KASSALAPP_BASE_URL` (må være `https`), med `redirect: 'error'`. Den logges aldri, og
  den står aldri i feilmeldinger. Testene bruker en oppdiktet nøkkel og sjekker loggen.
- **Logg:** `/prices/<gtin>` logges som `/prices/[gtin]`. Grunnen til at Kassalapp ikke svarte, logges uten kode.
- Tekst fra Kassalapp vises som ren tekst. Lenker åpnes med `rel="noopener noreferrer"`.

## API
Se [api-documentation.md](../api-documentation.md).

## Avvik og tillegg under implementeringen

- **Enhetsprisen fra Kassalapp brukes ikke.** `current_price.unit_price` har ingen enhet i svaret (kr per kg, per
  liter eller per stykk). Vi regner enhetsprisen selv fra pris og pakningsstørrelse, med heltall, og viser ingen
  enhetspris når pakningsstørrelsen mangler.
- **Samtidige oppslag:** Playwright fant at to forespørsler for samme strekkode samtidig ga 500 (den andre lagringen
  traff den unike nøkkelen). Nå deler forespørsler i samme prosess ett kall til Kassalapp, og en lagring som taper
  kappløpet mot en annen server, droppes (den første er like god). Begge deler er testet.
- **Listen per linje på handlelisten** tegnes først når «Vis anslag per linje» åpnes, så linjetekstene ikke står to
  ganger på siden.
- **Testhjelperen `useTallPhoneViewport`** (fase 3) venter nå til siden har sluttet å hente data før den måler
  høyden. Under høy belastning på serveren kom det siste kortet på profilsiden etter målingen, og axe meldte at en
  knapp lå bak bunnmenyen. Ikke en feil i fase 12, men den ble synlig under kjøringen.

## Utenfor fasen
Fritekstsøk, prishistorikk og grafer, webhooks, «handle alt billigst»-sammenligning av hele handlelisten per kjede,
priser per butikk, tilbud og medlemspriser, varsel om prisfall, pris fra Kassalapp som forslag i kjøpsskjemaet.

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-12).
