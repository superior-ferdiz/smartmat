# ADR-0017: Tesseract på serveren – foreløpig, og bare butikk, dato og total som standard

**Status:** Foreslått 2026-10-24 av KI (Claude) etter pilotmålingen i fase 8. **Foreløpig:** målt på bare
3 kvitteringer. Må måles på nytt når teamet har flere, minst én fra Rema 1000. Ikke godkjent av teamet ennå.
Utdyper [ADR-0011](0011-ocr-velges-etter-maling.md).

## Kontekst
ADR-0011 sier at OCR-løsningen skal velges etter en måling på 20–30 ekte kvitteringer, med Tesseract på serveren
først. Teamet hadde 3 kvitteringer per 2026-10-24: 2 fra Extra og 1 fra Kiwi, alle fra samme dag. Det var ingen fra
Rema 1000, og ingen med rabatt. «Godt nok» ble avtalt før målingen (spesifikasjon 08, «Pilotmåling»).

## Målingen
- **Fasit:** KI (Claude) transkriberte kvitteringene fra bildene. Ferdinand Risan kontrollerte fasiten mot papiret
  2026-10-24.
- **Motor:** Tesseract 5.3.0 med Debians norske modell (`tesseract-ocr-nor`, den raske LSTM-modellen). Den kjører i et
  Docker-bilde uten nettverk (`docker/ocr/`).
- **Forbehandling:** bildet lagres med lengste side 3000 piksler. Varianter:

  | Variant | Hva |
  |---|---|
  | V1 | rått bilde |
  | V2 | retning, gråtone, beskjæring til papiret, normalisering |
  | V3 | V2 med terskling |
  | V4 | V2 med utretting |

  V4 ble også målt i full størrelse. Hver variant ble kjørt med psm 4 og psm 6 (måten Tesseract deler siden i
  blokker på).
- **Måleskript:** `apps/api/scripts/ocr-pilot.ts`. Utdata med bare tall ligger i
  `docs/evidence/test-results/fase-8/`. Teksten fra kvitteringene ligger bare i den private mappen utenfor repoet.

### Seks kjøringer, og hvorfor

| Kjøring | Endring før kjøringen | Funn |
|---|---|---|
| 1 | – | Tesseracts retningsgjenkjenning (OSD) valgte feil retning på begge bildene som var tatt liggende, og beskjæringen fant ikke en smal kvittering. Begge fikk 0 på alle felt. |
| 2 | Retning velges ved å lese to retninger og ta den med mest sikker tekst. Papiret finnes i to omganger. V4 (utretting) ble lagt til. | Linjene ble funnet, men beløpene havnet ofte på feil linje eller ble lest feil. |
| 3 | Parseren ble lagt til (nivå 2) | Parseren mistet linjer OCR hadde lest. |
| 4 | Åtte generelle rettinger i parseren, se spesifikasjon 08. Hver har en fiktiv test. | Samme treff for V2 med psm 4 som i kjøring 6 |
| 5 | Ekstra retninger leses når den beste lesingen er usikker. Det ble funnet med en fiktiv, kort kvittering i røyktesten. | V2 med psm 4 uendret. Med psm 6 valgte målet «ord × snittsikkerhet» feil retning. |
| 6 | Retningen velges etter antall *sikre* ord (sikkerhet ≥ 60) | Resultatet under. V2 med psm 4 er lik i kjøring 4, 5 og 6. |

**Røyktest av hele kjeden** (2026-10-24): `server.ts` og `worker.ts` med ekte pg-boss og Tesseract i Docker,
med en generert, fiktiv kvittering som lå på siden. Butikk, dato, total og linjesum ble lest riktig
(sikkerhet 95, 4,5 s). Loggene hadde ingen tekst fra kvitteringen. Den midlertidige kontoen ble slettet.

**Viktig forbehold:** parseren og forbehandlingen er justert etter å ha sett hvordan de gjorde det på akkurat disse
tre kvitteringene. Tallene under er derfor sannsynligvis **for gode**. Kvitteringene som kommer senere, skal måles
før noen ser på dem, som et rent kontrollsett.

### Resultat, kjøring 6, nivå 2 (OCR og parser mot fasiten)

| Variant | Kjede­familie | Kjede­navn | Dato | Total | Linjer funnet | Beløp riktige (av funnet) | Pant funnet | Tid (snitt) | Minne (topp) |
|---|---|---|---|---|---|---|---|---|---|
| V1 rått, psm 4 | 1/3 | 0/3 | 1/3 | 1/3 | 7/12* | 3/7 | 2/4 | 1,4 s | 114 MB |
| **V2, psm 4** | **3/3** | **1/3** | **3/3** | **3/3** | **14/16 (88 %)** | **7/14 (50 %)** | **2/4** | **6,8 s** | **52 MB** |
| V2, psm 6 | 1/3 | 0/3 | 1/3 | 1/3 | 7/16 (44 %) | 2/7 (29 %) | 1/4 | 12,3 s | 49 MB |
| V4 full størrelse, psm 4 | 3/3 | 2/3 | 2/3 | 3/3 | 13/16 (81 %) | 8/13 (62 %) | 2/4 | 10,6 s | 51 MB |

\* V1 fant ingen tekst på én kvittering, så den er ikke med i antallet linjer.

- **Tid:** to til fire retninger, i Docker, på serveren (20 kjerner), én kvittering om gangen. Snittet er høyere
  enn i kjøring 4 (5,4 s), fordi én kvittering hadde snittsikkerhet under 70 og ble lest i fire retninger.
- **psm 6 er ustabil:** med psm 6 gikk V2 fra 12/16 linjer i kjøring 4 til 7/16 i kjøring 6. Den er følsom for
  retningsvalget, og er ikke valgt.
- **Minne:** Tesseract-prosessen alene, målt ved å lese `memory.current` hvert 50. millisekund.
- **Alle kjøringene** er lagret i `docs/evidence/test-results/fase-8/`.

### Mot kravet «godt nok» (V2, psm 4)

| Felt | Krav | Målt | Oppfylt |
|---|---|---|---|
| Kjede | Alle | Familie 3/3, navn 1/3 | Nei (navnet) |
| Dato | ≥ 5 av 6 | 3/3 | Ja |
| Total | ≥ 5 av 6 | 3/3 | Ja |
| Varelinjer funnet | ≥ 80 % | 88 % | Ja |
| Beløp per linje | ≥ 90 % | 50 % | **Nei** |
| Pant | ≥ 90 % | 2 av 4 funnet, 1 riktig | **Nei** |
| Rabatt | – | Ikke målbart | – |

**Hvorfor beløpene feiler:**
- **Lesefeil:** 29,90 ble lest som «29.99», og 2,00 som «12.00».
- **Feil linje:** når bildet er skjevt eller papiret krøllete, kan et beløp havne på linjen under.
- Parseren retter det den kan med kvitteringens egne kontrollsummer (antall × stykkpris, vekt × kilopris), og
  flagger resten.

**Kjedenavnet:** Extra-logoen er et bilde, ikke tekst. Familien (Coop-oppsett) finnes ut fra oppsettet.

## Beslutning (forslag)
1. **Tesseract på serveren** (V2, psm 4), i workeren, uten nettverk. Ingen skytjeneste. Grensen på 3000 piksler
   beholdes, fordi full størrelse ikke ga noen sikker gevinst.
2. **Som standard foreslår appen bare butikk, dato og total.** Brukeren fører kjøpet som totalsum, eller legger til
   linjer selv. Dette følger regelen i spesifikasjon 08.
3. **Linjeforslag** finnes, men er av (`RECEIPT_LINE_SUGGESTIONS=false`). Teamet kan slå det på når en ny måling
   viser at beløpene holder. Når det er på, er alle usikre linjer merket, og avvik mellom linjesum og total vises.
4. **Skytjeneste:** vurderes ikke nå. Det krever teamets godkjenning og dokumenterte vilkår (ADR-0011), og tallene
   over sier ikke om en skytjeneste ville vært bedre.

## Alternativer
- **Tesseract med linjeforslag på:** sparer skriving av varenavn (88 % funnet), men halvparten av beløpene måtte
  rettes. Brukeren kan da stole på tall som er feil, selv om de er merket. Forkastet inntil videre.
- **`tessdata_best`:** den store norske modellen kan lese bedre, men er ikke målt. Kan prøves ved neste måling.
- **Skytjeneste for kvitteringer:** sannsynligvis bedre lesing, men bildene forlater serveren, og det trengs avtale
  og vilkår. Ikke målt.
- **Bare manuell registrering (ingen OCR):** trygt, men fase 8 skulle prøve automatisk utfylling.

## Konsekvenser
- Bildet forlater aldri serveren. Workeren trenger rundt 50 MB til Tesseract, i tillegg til Node. En grense på
  512 MB for workeren er god margin.
- Uttrekket (råtekst og tolkede linjer) lagres uansett, så en ny måling kan gjøres uten at brukerne laster opp på
  nytt. Det gjelder bare så lenge kvitteringen ikke er bekreftet, og høyst i 7 dager.
- Kvitteringene og måleresultatene i den private mappen slettes når teamet har godkjent denne ADR-en, senest
  2026-11-23.
- **Personvern i målingen:** bildene ble lest av Tesseract på serveren. De ble også vist til KI-assistenten
  (Claude, Anthropic) i chat, slik teamet selv ba om, for å lage fasiten. Ingen annen tjeneste har fått dem.
