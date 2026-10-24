# 08 – Kvitterings-OCR (fase 8)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-24 («Vi godkjenner alt i plenum»). Anbefalingene i
de åpne spørsmålene gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før implementeringen. Ferdinand
oppga at godkjenningen ble gjort i plenum. Linus Saxe Huseby har ikke bekreftet det selv i en økt.

**Bygger på:** NFR-DATA-002 (import), NFR-SEC-001/002/004, NFR-REL-001 og NFR-UX-001–004 i
[00-kravoversikt.md](00-kravoversikt.md), samt ADR-0006, ADR-0007, ADR-0008, [ADR-0011](../architecture-decisions/0011-ocr-velges-etter-maling.md)
og [ADR-0015](../architecture-decisions/0015-lukket-testmiljo.md). Valget av OCR skrives i ADR-0017 etter målingen.

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | De ekte kvitteringene | Flyttet ut av repoet til `/opt/Websites/smartmat-private/kvitteringer/` (mappe `0700`, filer `0600`). `.gitignore` og `npm run check:files` stopper bildefiler utenfor `docs/evidence/screenshots/`. |
| 2 | Hvor Tesseract kjører | I et Docker-bilde (`docker/ocr/`), uten nettverk. Ingenting installeres på selve serveren. |
| 3 | Målemetode og «godt nok» | Som beskrevet under [Pilotmåling](#pilotmåling). |
| 4 | Pant og rabatt | Pant blir en egen linje av typen ikke-mat. Rabatt trekkes fra varelinjen over (nettobeløp, ingen negative linjer, som avgjørelse 5 i fase 4). |
| 5 | Slettefrister | Bilde og uttrekk slettes ved bekreftelse eller forkasting, og uansett etter 7 dager. Pilotdataene slettes når ADR-0017 er godkjent, senest 2026-11-23. |
| 6 | Bakgrunnsjobb | Ja, med pg-boss i en egen worker (`apps/worker`), én jobb om gangen. |

## Begreper

| Begrep | Betydning |
|---|---|
| **Kvittering** (`receipt`) | Én opplastet kvittering og statusen dens. Blir værende etter bekreftelse, med kobling til kjøpet og duplikatnøkkelen. |
| **Kvitteringsbilde** (`receipt_image`) | Bildet etter at serveren har skrevet det om (uten metadata). Slettes ved bekreftelse eller etter fristen. |
| **Uttrekk** (`receipt_extraction`) | Det OCR og parseren fant: råtekst (uten betalingslinjer), tolkede linjer, konfidens og hvilken motor som ble brukt |
| **Kjedeprofil** | Reglene parseren bruker for én kjede: desimaltegn, fortsettelseslinjer for antall og vekt, pant, total |
| **Konfidens** | Tesseracts sikkerhet per ord (0–100), slått sammen per linje. Under grensen merkes linjen «Usikker – sjekk». |

## Status for en kvittering

| Status | Betydning | Neste |
|---|---|---|
| `queued` | Lastet opp, venter på tolkning | `processing` |
| `processing` | Tolkes nå | `review` eller `failed` |
| `review` | Klar til gjennomgang | `confirmed` eller `discarded` (slettes) |
| `failed` | Tolkningen feilet (`failure_code`) | `queued` (prøv igjen) eller manuell utfylling |
| `confirmed` | Brukeren har bekreftet. Kjøpet finnes. | – |

Forkastede og utløpte kvitteringer slettes helt, så de har ingen egen status.

## Krav og akseptansekriterier

### FR-RCPT-001 Laste opp
- Siden `/kjop/kvittering` har to knapper: «Ta bilde» (åpner kameraet på telefonen, `capture="environment"`) og
  «Velg fil».
- **Godtatt:** JPEG, PNG og WebP. Typen avgjøres av innholdet i filen, ikke av filnavnet eller `Content-Type`.
- **Grenser:** høyst 10 MB og høyst 40 megapiksler. Over grensen: 413 `errors.receipt.tooLarge`. Feil type: 415
  `errors.receipt.unsupportedType`.
- Samme bildefil (lik sha256 etter omskriving) som allerede er under behandling eller gjennomgang i husholdningen,
  gir 409 `errors.receipt.alreadyUploaded` med lenke til den.
- Svaret er 202 med kvitteringen (`queued`).

### FR-RCPT-002 Bildet skrives om
- Serveren dekoder bildet, roterer det etter EXIF-retningen hvis den finnes, gjør det om til JPEG og **lagrer det
  uten noen metadata** (EXIF, GPS, ICC, XMP). Den opprinnelige filen lagres aldri.
- Lengste side begrenses til 3000 piksler. Hvis piloten viser at dette svekker lesingen, endres grensen og ADR-0017
  sier hvorfor.

### FR-RCPT-003 Tolkning i bakgrunnen
- Opplastingen legger en jobb i køen (pg-boss) med bare kvitteringens id. Workeren tolker én kvittering om gangen.
- **Tidsavbrudd:** 60 sekunder for hele tolkningen. Tesseract-prosessen avsluttes ved tidsavbrudd.
- **Feilkoder** (`failure_code`):

  | Kode | Når |
  |---|---|
  | `timeout` | Tolkningen tok for lang tid |
  | `unavailable` | OCR er ikke satt opp eller svarer ikke |
  | `invalidResponse` | OCR svarte med noe som ikke kan brukes |
  | `noText` | Ingen tekst funnet |

- Siden spør etter status hvert 2. sekund mens kvitteringen er i kø eller tolkes. Etter 60 sekunder står det at det
  tar lengre tid enn vanlig.
- I alle feiltilstander kan brukeren prøve igjen eller fylle inn kjøpet selv (lenke til det vanlige skjemaet).
- **Kø:** står det 20 kvitteringer i kø for hele serveren, svarer opplastingen 503 `errors.receipt.busy`.

### FR-RCPT-004 Tolkning av teksten (parser)
- Parseren er rene funksjoner i `packages/shared/src/receipts/` og regner alle beløp som heltall i øre (ADR-0006).
- **Kjede** finnes bare fra toppen av kvitteringen, før første varelinje. Varenavn kan inneholde et kjedenavn.
- **Fra kvitteringen hentes:** kjede, dato, klokkeslett, kvitteringsnummer (hvis det finnes), varelinjer og total.
  Betalingsdelen (kort, terminal, autorisasjon) leses ikke.
- **Per linje:** tekst, beløp, mengde (antall eller vekt i gram) med stykk- eller kilopris, mva-sats (hvis den står),
  om det er pant, rabatt trukket fra, og konfidens.
- **Kontrollsum:** summen av linjene (inkludert pant, minus rabatter) sammenlignes med totalen. Avvik merkes.
- **Forslag til type:** pant → ikke-mat. Mva 25 % → ikke-mat. Mva 15 % → mat. Ellers mat. Brukeren kan alltid endre.
- Kjedeforskjellene er beskrevet i [kjedeformater.md](../kjedeformater.md).

### FR-RCPT-005 Gjennomgang
- Gjennomgangssiden viser bildet (kan forstørres) og et skjema med samme felt som et vanlig kjøp (fase 4): butikk,
  dato og linjer, med mulighet for «Legg i matlageret».
- Linjer med lav konfidens merkes «Usikker – sjekk» med ikon og tekst, ikke bare farge.
- Avvik mellom linjesum og total vises over linjene: «Linjene blir X, kvitteringen sier Y.»
- Råteksten kan vises i en sammenleggbar boks, som hjelp ved retting.
- Mengde fra vekt eller antall fylles ut når linjen legges i matlageret.

### FR-RCPT-006 Bekreftelse
- **Ingenting blir et kjøp før brukeren trykker «Bekreft kjøpet»** (ADR-0007, ADR-0011).
- Bekreftelsen bruker samme regler og samme tjeneste som et manuelt kjøp (`source=receipt`). Kjøp, linjer, nye varer,
  partier og hendelser lagres i én transaksjon (`insertBatchWithEvent`), og ingredienskoblingen skjer som før.
- I samme transaksjon settes kvitteringen til `confirmed`, og bildet og uttrekket slettes.

### FR-RCPT-007 Duplikater (NFR-DATA-002)
- **Sterk nøkkel:** når kjede, dato, klokkeslett, kvitteringsnummer og total er bekreftet eller funnet, får kjøpet
  `dedupe_key = "receipt:" + sha256(...)`. Den er unik per husholdning, så samme kvittering kan aldri gi to kjøp. En
  ny kvittering med samme nøkkel gir 409 `errors.receipt.duplicate` med lenke til kjøpet.
- **Uten sterk nøkkel:** finnes et kjøp med samme dato og total, vises en advarsel «Ser ut som et kjøp du har
  registrert». Brukeren må krysse av for å lagre likevel.
- **Dobbel bekreftelse** av samme kvittering gir 200 med kjøpet som allerede finnes.
- Slettes kjøpet, slettes også kvitteringsraden, slik at kvitteringen kan importeres på nytt.

### FR-RCPT-008 Sletting og frister
- Bilde og uttrekk slettes når kvitteringen bekreftes eller forkastes.
- Kvitteringer som ikke er bekreftet, slettes helt etter **7 dager** (`delete_after`). En jobb rydder hver time, og
  utløpte rader vises aldri, selv før jobben har kjørt.
- Sletting av kontoen sletter husholdningen og alt over (cascade).

### NFR-REL-002 Når OCR er nede
- Kjøp, matlager, budsjett, oppskrifter og handleliste bruker ikke OCR.
- Uten oppsatt OCR (`OCR_PROVIDER=off`) viser opplastingssiden at tolkning ikke er tilgjengelig, og lenker til det
  vanlige skjemaet.

## Grenser (rate limiting)
- 10 opplastinger i timen per bruker (429).
- 20 kvitteringer i kø for hele serveren (503).

## Sikkerhet og personvern
- Alle ruter ligger under `/households/:householdId/receipts` med `requireAuth` og `householdAccess`. Fremmed
  husholdning eller kvittering gir 404. IDOR-test for hvert endepunkt.
- Sammensatte fremmednøkler `(receipt_id, household_id)` på bilde og uttrekk, og `(purchase_id, household_id)` på
  kvitteringen.
- **Logger:** ingen kvitteringstekst, ingen filnavn, ingen beløp og ingen butikk. Workeren logger bare id, status og
  varighet. URL-er med kvitterings-id er ikke personopplysninger alene, men loggføres uten spørrestreng.
- **Råteksten lagres uten betalingslinjer:** linjer med maskert kortnummer, terminal, AID og autorisasjonskode
  fjernes før lagring.
- Bildet sendes til nettleseren med `Cache-Control: no-store` og bare til medlemmer av husholdningen.
- Tesseract kjører uten nettverkstilgang. Ingen skytjeneste brukes.
- Ekte kvitteringer brukes aldri i tester, fixtures, logger eller dokumentasjon.

## Pilotmåling

**Utvalg:** de ekte kvitteringene til teamet (per 2026-10-24: 2 fra Extra, 1 fra Kiwi, 0 fra Rema 1000). Det er
færre enn de 20–30 ADR-0011 forutsetter, så resultatet er foreløpig.

**Fasit:** KI transkriberer hver kvittering til strukturert JSON i den private mappen (kjede, dato, klokkeslett,
total, linjer med tekst, beløp, type, mengde og mva). Teamet kontrollerer fasiten mot papiret før målingen.

**Varianter:** V1 rått bilde. V2 gråtone, retning fra Tesseracts OSD og normalisering. V3 som V2, men med
terskling. Den beste varianten blir forbehandlingen i appen.

*Tillegg under implementeringen (2026-10-24):*
- **V2 i full størrelse** måles også, for å se om grensen på 3000 piksler (FR-RCPT-002) svekker lesingen.
- **Hver variant måles med psm 4 og psm 6.** psm er Tesseracts måte å dele siden i blokker på: psm 4 er én spalte
  med tekst i ulik størrelse, og psm 6 er én jevn blokk. Selvtesten med en fiktiv kvittering viste at psm 4 mistet
  hele beløpskolonnen når det var stort mellomrom mellom varetekst og beløp.

**To nivåer:**
1. **OCR alene:** finnes fasitfeltene i råteksten? Beløp må stemme eksakt. Varetekst måles med andel feil tegn
   (CER) mot beste linje.
2. **Hele kjeden:** OCR og parser mot fasiten, felt for felt. Det er dette nivået «godt nok» gjelder.

**«Godt nok» for Tesseract (nivå 2):**

| Felt | Krav |
|---|---|
| Kjede | Alle |
| Dato | ≥ 5 av 6 |
| Total (eksakt øre) | ≥ 5 av 6 |
| Varelinjer funnet (CER ≤ 0,25) | ≥ 80 % |
| Beløp per linje (eksakt) | ≥ 90 % av linjene som ble funnet |
| Pant | ≥ 90 % |
| Rabatt | Ikke målbart: ingen rabatter i utvalget. Testes bare med fiktiv tekst. |

Med færre enn 6 kvitteringer gjelder samme andeler. Nås ikke kravet, foreslår appen bare butikk, dato og total
(kjøp med bare totalsum), og en skytjeneste vurderes bare etter teamets godkjenning.

**Slettes:** bilder, fasit og OCR-utdata i den private mappen slettes når ADR-0017 er godkjent, senest 2026-11-23.
Bare samlede tall kommer i ADR-en. Avidentifiserte utdrag brukes bare etter teamets godkjenning.

## API
Se [api-documentation.md](../api-documentation.md).

## Avvik og tillegg under implementeringen

- **Workeren er et eget startpunkt i API-pakken** (`apps/api/src/worker.ts`, `npm run worker -w @smartmat/api`),
  ikke en egen `apps/worker`. Den bruker API-ets databasekode og providere, og en egen pakke måtte ha kopiert dem.
- **Retning:** Tesseracts OSD valgte feil retning på to av tre ekte kvitteringer. Retningen velges i stedet ut fra
  formen på papiret: to retninger leses, og den med flest sikre ord (sikkerhet ≥ 60) vinner. Er den beste lesingen
  usikker (snitt under 70), leses de to andre også. Det siste ble lagt til etter at røyktesten med en fiktiv, kort
  kvittering viste at en kort kvittering som ligger på siden, ser stående ut.
- **Beskjæring til papiret** i to omganger: først en grov boks, så hver retning telt innenfor den andre.
- **Parseren** fikk åtte generelle rettinger etter pilotkjøring 3, hver med en fiktiv test:
  1. støy i venstre kant
  2. mellomrom inne i beløp
  3. O% leses som 0 %
  4. «Part» for «Pant»
  5. «N varer» og «Bank» avslutter varelisten
  6. «Totalbelør» godtas
  7. toppteksten avgjøres bare av sikre kjennetegn
  8. inntil tre tegn støy etter et beløp
- **Antall × pris vinner** over et beløp som er lest annerledes, og linjen merkes. To tall som stemmer med hverandre,
  er sikrere enn ett.
- **`refId` i feilsvaret:** ved duplikat og «samme bilde» peker API-et til raden konflikten gjelder (bare id).
- **Logger:** fra fase 8 logges alle URL-er uten spørrestreng, ikke bare kvitteringsrutene.
- **Nedskalering i nettleseren:** bildet tegnes på nytt i et canvas før opplasting når nettleseren kan
  (`createImageBitmap`). Det sparer data på telefon og fjerner EXIF allerede der. Serveren fjerner metadata
  uansett.
- **Fremdrift ved opplasting** vises som «Laster opp …» med en snurrende indikator, ikke i prosent. `fetch` gir ikke
  fremdrift for opplasting.
- **pg-boss `singletonKey`** hindrer ikke doble jobber i en vanlig kø. En jobb nummer to er likevel ufarlig, fordi
  workeren bare tar en kvittering som står i kø.
- **Kjedens navn** blir ofte ikke funnet, fordi Extra-logoen er et bilde. Familien (Coop- eller NG-oppsett) finnes
  ut fra oppsettet. Da foreslås ingen butikk, og brukeren skriver den selv.

## Utenfor fasen
Skytjenester for OCR, KI-tolkning av linjene, at appen husker kvitteringstekst → vare for husholdningen, HEIC,
flere sider per kvittering, kvitteringer fra apper (Trumf, Coop-appen), og prisdata (fase 12).

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-8).
