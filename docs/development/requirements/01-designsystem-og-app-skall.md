# 01 – Designsystem og app-skall (fase 1)

**Status:** Godkjent som plan av Ferdinand Risan i chat 2026-10-20 ("All good"). Skrevet av KI (Claude).
Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

**Bygger på:** NFR-UX-001–004, KURS-01, KURS-02, KURS-05, KURS-07 i [00-kravoversikt.md](00-kravoversikt.md),
ADR-0001, ADR-0004, ADR-0006.

Fasen har ingen backend og ingen database. Alt innhold på sidene er plassholdere, og eksempeldata er tydelig merket.

## Seksjoner og navigasjon

| # | Seksjon | Rute | Bunnmeny (mobil) |
|---|---|---|---|
| 1 | Oversikt | `/` | ja |
| 2 | Matlager | `/matlager` | ja |
| 3 | Skann | `/skann` | ja (fremhevet midtknapp) |
| 4 | Oppskrifter | `/oppskrifter` | ja |
| 5 | Handleliste | `/handleliste` | via «Mer» |
| 6 | Kjøp og budsjett | `/budsjett` | via «Mer» |
| 7 | Måltidsplan | `/maltidsplan` | via «Mer» (merket «Kommer senere») |
| 8 | Husholdning | `/husholdning` | via «Mer» (merket «Kommer senere») |
| 9 | Innstillinger | `/innstillinger` | via «Mer» |

«Mer» (`/mer`) er en egen side med lenker, ikke en meny som legger seg over innholdet.

## Krav og akseptansekriterier

### FR-UI-001 Navigasjon
- Under 900 px vises en bunnmeny med Oversikt, Matlager, Skann, Oppskrifter og Mer. Sidemenyen vises ikke.
- Fra 900 px vises en sidemeny med alle 9 seksjonene. Bunnmenyen vises ikke.
- Lenken for siden man står på har `aria-current="page"` og er visuelt markert med mer enn bare farge.
- Navigasjonen er en `<nav>` med tilgjengelig navn, og alle lenker kan nås og aktiveres med tastaturet.
- Det finnes en «Hopp til hovedinnhold»-lenke som første fokuserbare element.
- Ved rutebytte flyttes fokus til sidens `<h1>`.

### FR-UI-002 Plassholdersider
- Hver seksjon har en egen rute med en `<h1>` og en tomtilstand som forklarer hva som kommer.
- Ukjente ruter viser en 404-side med lenke til Oversikt.

### FR-UI-003 Forside med kortrutenett
- Forsiden viser kort i et CSS Grid som går fra én kolonne på 360 px til flere kolonner på bredere skjerm.
- Siden og hvert kort med eksempeltall er merket «Eksempeldata» med tekst, ikke bare farge.

### FR-UI-004 Tema
- Standard følger operativsystemets innstilling (`prefers-color-scheme`).
- Bruker kan velge Automatisk, Lyst eller Mørkt i Innstillinger. Valget huskes i nettleseren (`localStorage`).
- Siden blinker ikke i feil tema ved innlasting.
- Hvis lagring i nettleseren ikke er tilgjengelig, virker appen fortsatt (med automatisk tema).

### FR-UI-005 Språk
- Standardspråk er norsk bokmål (`nb-NO`). Engelsk (`en`) kan velges i Innstillinger, og valget huskes.
- `<html lang>` følger valgt språk.
- All synlig tekst i komponentene kommer fra oversettelsesfilene. Lint-regelen stopper hardkodet tekst i JSX.

### FR-UI-006 Tilgjengelige skjemakomponenter
Gjelder Button, TextField, NumberField, Select, DateField og Checkbox.
- Hvert felt har en synlig `<label>` koblet til feltet.
- Hjelpetekst og feilmelding er koblet til feltet med `aria-describedby`. Ved feil har feltet `aria-invalid="true"`.
- Feilmeldingen (FormError) har et ikon og tekst, ikke bare rød farge.
- Fokus er alltid synlig (`:focus-visible`), med kontrast minst 3:1 mot bakgrunnen.
- Klikkflater er minst 44 × 44 px.
- NumberField for beløp godtar norsk desimalkomma (`49,90`) og bruker parseren i `packages/shared`.
- Automatisk axe-sjekk finner ingen brudd.

### FR-UI-007 Tilstander for lasting, feil og tomt
- `LoadingState` annonseres for skjermlesere (`role="status"`) og respekterer `prefers-reduced-motion`.
- `ErrorState` forklarer hva som gikk galt og kan tilby «Prøv igjen».
- `EmptyState` forklarer hva som mangler og kan tilby en handling.
- `Toast` og `Alert` finnes i variantene info, suksess, advarsel og feil. Toast annonseres med `aria-live` og
  forsvinner ikke mens musepeker eller fokus er på den.

### FR-SHR-001 Beløp i øre
- `parseOre("49,90")` gir `4990`. Punktum godtas også som desimaltegn (`"49.90"`), med maks to desimaler.
- Tusenskille med mellomrom (også hardt mellomrom) godtas: `"1 234,50"` gir `123450`.
- Negative beløp (`"-12,5"`) gir `-1250`.
- Ugyldig input (tom streng, bokstaver, tre desimaler, flere desimaltegn, tall utenfor trygt heltallsområde) gir en
  feil, ikke et tall. Parseren bruker aldri flyttall.
- `formatOre(4990)` gir `"49,90 kr"` (norsk format).
- Zod-skjemaet `oreAmountSchema` godtar bare ikke-negative trygge heltall.

## Ikke-funksjonelle krav i denne fasen
- NFR-UX-001: Ingen side har horisontal rulling på 360 px bredde (Playwright måler dette).
- NFR-UX-002: Fargene i lyst og mørkt tema har kontrast minst 4,5:1 for tekst og 3:1 for kanter på skjemafelt
  og fokusring (se tabellen i `apps/web/src/styles/tokens.css`).
- NFR-UX-004: Grensesnittet er på bokmål som standard.

## Utenfor fasen
Innlogging, API, database og ekte data. Ikoner for seksjonene tegnes selv som SVG.

## Sporbarhet til tester

Se tabellen i [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-1).
Alle krav over er dekket av minst én automatisk test. Resultater fra 2026-10-20: 233/233 enhetstester og
63/63 Playwright-tester bestått.

## Til gjennomgang for teamet

Dette er skrevet av KI og må vurderes av Ferdinand og Linus før fasen kan regnes som ferdig:

1. Kjør `npm install` og `npm run dev`, og prøv appen på mobilen (eller med 360 px i nettleserens utviklerverktøy).
2. Se på fargene og skriften i lyst og mørkt tema. Passer det til en norsk forbrukerapp?
3. Bruk appen **bare med tastaturet** (Tab, Shift+Tab, Enter, mellomrom). Gå gjennom eksempelskjemaet på
   `/designsystem` og send det inn tomt.
4. Les `packages/shared/src/money/ore.ts` og testene. Forstår dere hvorfor det ikke brukes flyttall?
5. Les `apps/web/src/layout/AppShell.module.css` og `pages/OverviewPage.module.css` (CSS Grid). Kan dere forklare dem?
6. Er de 9 seksjonene og rekkefølgen riktig?
7. Bestem om Git skal innføres før fase 2 (anbefalt i ADR-0012).

Registrer gjennomgangen i utviklingsloggen og KI-loggen (hvem, dato, hva som ble sett på, endringer).
