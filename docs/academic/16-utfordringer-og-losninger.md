# Utfordringer og løsninger

> **Status: UTKAST (KI).** Et utvalg laget av KI (Claude) i fase 14, 2026-10-27, fra «Feil funnet»-avsnittene i
> kapittel 11 og utviklingsloggen. Alle problemene ble funnet og løst av KI-assistenten, ikke av teamet. **Hva som var
> vanskelig for teamet, står tom.** Ikke gjennomgått av teamet.

## Tekniske utfordringer

| # | Utfordring | Hvordan den ble funnet | Løsning | Mer |
|---|---|---|---|---|
| 1 | **Testene beviste ikke noe.** Alle 47 API-testene i fase 2 besto første gang, så det var ikke vist at de kunne feile. | At alt var grønt | Mutasjonskontroll: hver beskyttelse slås av med vilje, og testene må feile. Fant hull i nesten hver fase. | [Bevisoversikt](../evidence/bevisoversikt.md#mutasjonskontroll) |
| 2 | **Penger og mengder uten avrundingsfeil.** Flyttall gir feil i øre. | Bestemt før koden (ADR-0006) | Heltall i øre og grunnenheter overalt. Den eneste overgangen fra flyttall er `kronerToOre` for svarene fra Kassalapp. | Kapittel 10, eksempel 1, 10 og 45 |
| 3 | **To forespørsler samtidig** kunne gi negativ mengde, dobbel handleliste eller to eiere. | Gjennomlesning og API-tester med samtidige kall | Betingede oppdateringer (`updateMany` med vilkår), låsing av raden (`FOR UPDATE`) og unike indekser i databasen | Kapittel 10, eksempel 11, 25 og 40 |
| 4 | **Kvitteringer fra ekte telefoner.** Tesseract valgte feil retning og fant ikke en smal kvittering. Første måling ga 0 på to av tre. | Pilotmålingen på teamets kvitteringer | Retning fra papirets form, alle fire retninger når lesingen er usikker. Bare butikk, dato og total foreslås. | [ADR-0017](../development/architecture-decisions/0017-tesseract-pa-serveren-forelopig.md) |
| 5 | **Én spørring leste alle husholdningers data.** En `EXPLAIN` med faste verdier så fin ut. | `auto_explain` på spørringene appen faktisk sendte, med 501 genererte husholdninger | `u.household_id = e.household_id` i anti-joinen | Kapittel 10, eksempel 48 |
| 6 | **Kodedeling brøt fokus.** Når en side lastes ved behov, finnes ikke overskriften ennå når fokus skal flyttes. | Playwright (enhetstestene laster alle sider på forhånd) | Hooken venter på `<h1>` med en `MutationObserver` | Kapittel 11, feil funnet i fase 13 (funn 4) |
| 7 | **Ustabile tester under last.** Et annet prosjekt på serveren ga load average rundt 20–38. | Feilede Playwright-kjøringer (lagret) | Testene venter på at nettverket er stille før de måler. Feilene er lagret, ikke skjult. | Kapittel 11, fase 10 og 12 |
| 8 | **Lekkasje av personopplysninger i logger.** Strekkoder og tokens kunne havnet i URL-er i loggen. | Egne loggtester | `redactUrl`, tokens i body eller i `#fragment`, aldri i URL-en serveren ser | Kapittel 12 |

## Praktiske utfordringer

| # | Utfordring | Hva som ble gjort |
|---|---|---|
| 1 | **Ekte kvitteringer er personopplysninger.** De lå i roten av repoet. | Flyttet til en privat mappe utenfor repoet, med en sjekk (`check:files`) som stopper bilder i Git. Bildene slettet 2026-10-29, fasit og måleresultater senest 2026-11-23. |
| 2 | **Vilkårene til eksterne tjenester.** Spoonacular forbyr lagring, TheMealDB er bare for utvikling, Kassalapp dekker ikke tre av de største kjedene. | Vilkårene lest før koden, og valgene skrevet i ADR-er. |
| 3 | **Serveren deles med andre nettsteder.** | Egne regler i CLAUDE.md (ingen `pkill`, ikke røre andres containere, sjekke disken), eget Docker-nett (ADR-0022). |
| 4 | **Ingen nøkkel og ingen kontaktadresse.** | Funksjonene er av som standard, og appen virker uten dem (NFR-REL-001). |
| 5 | **Mye kode på kort tid.** | Alt er dokumentert per fase, men teamet har ikke rukket å gjennomgå det. Se kapittel 14. |

## Det som var vanskelig for teamet

<!-- Teamet skriver: hva som var vanskelig for dere – å forstå koden, å kontrollere KI-en, å samarbeide, tempoet,
å vite hva som er godt nok. -->

## Kilder i prosjektet

- Kapittel 10, 11 og 12, [utviklingslogg](../development/development-journal.md),
  [bevisoversikt](../evidence/bevisoversikt.md)
