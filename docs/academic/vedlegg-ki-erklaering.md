# Vedlegg: erklæring om bruk av KI

> **Status: UTKAST skrevet av KI (Claude) i fase 14, 2026-10-27, fra [KI-loggen](../evidence/ai-usage/ai-logg.md).
> Fakta oppdatert 2026-10-29 (del 3).**
> Dette er ikke teamets erklæring før Ferdinand Risan og Linus Saxe Huseby har lest den, rettet det som er feil,
> skrevet sine egne avsnitt og signert. KI-assistenten har bare fylt inn fakta fra loggene. Teamets meninger og
> vurderinger er ikke fylt inn. Kravene emnet stiller til en slik erklæring, er ikke kjent, så formen er et forslag.

## 1. Verktøy

| Verktøy | Modell | Periode | Hvem brukte det |
|---|---|---|---|
| Claude Code (VS Code-utvidelse), Anthropic | Claude Opus 5.5 | 2026-10-19 – 2026-10-29 | Ferdinand Risan |
| GPT-6, OpenAI (bildegenerering, utenfor dette repoet) | GPT-6 | Logoen ble lagt i prosjektmappen 2026-10-30 | *Teamet fyller inn* |

<!-- Teamet fyller inn andre KI-verktøy dere har brukt (også ChatGPT, Copilot eller lignende utenfor dette repoet),
eller skriver at dere ikke har brukt andre. -->

## 2. Hva KI-verktøyet gjorde

Dette står i KI-loggen (66 rader per 2026-10-30) og i utviklingsloggen. Det gjelder fase 0–15:

- **All programkode og alle automatiske tester** i repoet (nettappen, API-et, databasen, skriptene og Docker-oppsettet).
  Alle commits har `Co-Authored-By: Claude`.
- **Planer, spesifikasjoner og beslutninger:** fasemalen for hver fase, kravoversikten, de 14 fasespesifikasjonene og
  ADR-0001–0023 (ADR-0023 bygger på en løsning Ferdinand foreslo i prompten for fase 15; resten foreslått av KI).
- **Dokumentasjon:** CLAUDE.md, veikartet, utviklingsloggen, endringsloggen, KI-loggen og rapportkapitlene i
  `docs/academic/`. Kapittel 02, 03 og 18, og de delene som er merket «Teamet skriver», er ikke skrevet av KI.
- **Innhold i appen:** 27 oppskrifter oversatt og tilpasset fra Wikibooks, ingredienslisten med allergener og
  omregninger (106 ingredienser), tabellen fra Open Food Facts-kategorier, ordlyden i varsler, personvernerklæringen
  (utkast) og alle tekster i grensesnittet.
- **Undersøkelser:** lesing og oppsummering av vilkårene til Open Food Facts, Wikibooks, Spoonacular, TheMealDB,
  Kassalapp og Have I Been Pwned, og pilotmålingen av Tesseract på teamets kvitteringer.
- **Kjøring og bevis:** alle testkjøringer, mutasjonskontroller, målinger og skjermbilder i `docs/evidence/`.
- **Drift:** oppsett av testmiljøet på serveren, eget Docker-nett, sikkerhetskopi og Caddy-blokken, etter godkjente
  planer, og kontoene til teamet i testmiljøet (2026-10-29).
- **Fase 15:** egne oppskrifter, allergier og matvarer i Innstillinger og prisanslag på oppskrifter, etter teamets
  beslutninger i prompten. KI skrev ingen oppskrifter (testene bruker oppdiktede).
- **Fase 14:** bevisoversikten, sporbarhetsmatrisen, utkastene til rapportkapitlene, denne erklæringen, forslaget til
  presentasjon og sjekklisten for merge og innlevering.

## 3. Hva teamet gjorde

Fra loggene. **Teamet må rette og utfylle denne listen.**

- Ferdinand Risan skrev promptene til hver fase, tok beslutningene (for eksempel at oppskrifter skal «hentes fra
  internett»), godkjente planene i chat, opprettet repoet på GitHub og sa fra da DNS for testmiljøet var klart. Tre ekte kvitteringer
  til OCR-piloten kom fra teamet (hvem som tok dem, er ikke registrert).
- Ferdinand kontrollerte fasiten til OCR-piloten mot papirkvitteringene.
- Ferdinand har oppgitt at fase 5 og 7 og planene for fase 8, 9 og 13 er gjennomgått «i plenum», og for fase 7 og 9 av
  både ham og Linus Saxe Huseby. Omfang og funn er ikke oppgitt.
- 2026-10-29 oppga Ferdinand at endringene i fase 2–14 er «gjennomgått i plenum og godkjent». Hvem som var med, omfang og funn er
  ikke oppgitt.
- Linus Saxe Huseby har ikke vært med i noen økt med KI-verktøyet.

<!-- Teamet skriver: hva dere har gjort utenom øktene med KI – lest kode, testet appen, diskutert, skrevet tekst,
endret noe selv. Bare det som faktisk er gjort. -->

## 4. Hva som er kontrollert av mennesker

Per 2026-10-29 er dette registrert:

| Hva | Kontrollert av | Hvordan |
|---|---|---|
| Fasit til OCR-piloten | Ferdinand Risan | Mot papirkvitteringene («Kontrollert og all good») |
| Planene for fase 1–14 | Ferdinand Risan | Godkjent i chat. Om de ble lest i detalj, er ikke oppgitt. |
| Fase 2–14 (det pull requesten skal inneholde) | Teamet, i plenum (oppgitt av Ferdinand 2026-10-29) | «gjennomgått i plenum og godkjent». Omfang og funn er ikke oppgitt. |
| Oppskrifter, ingredienser, kategorier, vilkårsnotater, personvernvurderinger, rapportkapitler, hver for seg | **Ingen registrert** | – |

<!-- Teamet fyller inn det dere har kontrollert, med dato og hvordan. -->

## 5. Hva teamet står inne for

<!-- Teamet skriver med egne ord: hvilke deler dere kan forklare og står inne for, og hvilke dere ikke har kontrollert.
For eksempel: kan dere forklare hvordan innloggingen, autorisasjonen og tofaktoren virker? Skal noe tas ut av
innleveringen fordi dere ikke har kontrollert det? -->

## 6. Teamets egen vurdering av KI-bruken

<!-- Teamet skriver. Se kapittel 13 for fakta om feil KI gjorde og hvordan de ble funnet. Denne delen skal ikke skrives
av KI. -->

## 7. Signatur

| Navn | Dato | Har lest og står inne for erklæringen |
|---|---|---|
| Ferdinand Risan | | |
| Linus Saxe Huseby | | |

## Kilder i prosjektet

- [KI-logg](../evidence/ai-usage/ai-logg.md), [utviklingslogg](../development/development-journal.md)
- Kapittel 13 (KI-bruk) og 15 (gruppearbeid)
