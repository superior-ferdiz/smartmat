# Design og brukervennlighet

> **Status: Kontrollert mot systemet av KI 2026-10-27 – ikke godkjent av teamet.** (Fase 14: filstier, kodenavn og tall
> er sjekket mot repoet og de lagrede utdataene, og det som var utdatert, er rettet. Se kapittel 20.)
> Historikk: Første versjon skrevet etter fase 1 (2026-10-20), et avsnitt om varsler lagt til i fase 11, og
> oppdatert i fase 14 (2026-10-27) slik at det stemmer med appen etter fase 13. Skrevet av KI (Claude) og ikke
> gjennomgått av teamet ennå.
> Brukertesting med ekte personer er ikke gjort. Offisielle APP2000-krav til rapporten er ikke verifisert.

## Designprinsipper

SmartMat skal føles som en norsk forbrukerapp for kjøkkenet, ikke som et generisk programvareprodukt. Det ga noen
bevisste valg:

- **Varme, nordiske farger** i stedet for blått/lilla og gradienter: havrehvit bakgrunn, granskoggrønn hovedfarge og
  multeoransje aksent.
- **Mobil først.** Det meste brukes stående ved kjøleskapet. Alle sider er laget for 360 px bredde først
  (NFR-UX-001), og bredere skjermer får flere kolonner og sidemeny.
- **Tekst bærer meningen, farge støtter den.** Status som «Siste forbruksdag passert» står alltid i tekst. Farge,
  ikon og kantlinje er bare forsterkning (WCAG 1.4.1).
- **«Best før» og «Siste forbruksdag» skilles også visuelt.** Best før vises i gult/brunt (maten kan ofte fortsatt
  brukes), siste forbruksdag i rødt (mattrygghet). Rådene i teksten følger det samme skillet, og appen gir aldri råd
  om å spise mat etter siste forbruksdag.
- **Ærlige tall og tydelig opphav.** I fase 1 var forsiden fylt med merkede eksempeldata. Fra fase 3–5 viser den ekte
  data, og en test sjekker at ordet «Eksempeldata» ikke lenger finnes der. Det samme prinsippet gjelder senere:
  oppskrifter som ikke er kontrollert, er merket «KI-utkast», priser fra Kassalapp er merket som anslag med dato, og
  svinnsiden skiller faktisk verdi, anslått verdi og ukjent verdi.

## Fargesystem

Alle farger er definert som CSS custom properties (designtokens) i `apps/web/src/styles/tokens.css` (ADR-0004).
Komponentene bruker bare tokens, aldri faste fargekoder. Mørkt tema er derfor bare en ny verdi for de samme tokenene.

| Token | Lyst | Mørkt | Bruk |
|---|---|---|---|
| `--color-bg` | `#FAF7F2` | `#141A17` | Sidebakgrunn |
| `--color-surface` | `#FFFFFF` | `#1C2420` | Kort, skjemafelt |
| `--color-text` | `#1F2A24` | `#ECEFE9` | Brødtekst |
| `--color-text-muted` | `#56605A` | `#A9B3AC` | Hjelpetekst |
| `--color-primary` | `#1F6B4A` | `#6CC59A` | Hovedknapper, aktiv meny |
| `--color-accent` | `#E8833A` | `#F2A365` | Skann-knappen, eksempeldata |
| `--color-warning-*` | `#6E4400` på `#F8E7C2` | `#F4C76B` på `#3A2E14` | Best før |
| `--color-danger-*` | `#9C1F18` på `#FBE4E1` | `#FFB4AB` på `#3D1A18` | Siste forbruksdag, feil |
| `--color-focus` | `#1A5FB4` | `#8AB4F8` | Fokusring |

**Kontrast.** Kontrasten er regnet ut med WCAG-formelen for 27 fargepar i hvert tema. Kravet er minst 4,5:1 for
tekst og minst 3:1 for kanter på skjemafelt og fokusring. Utregningen er en automatisk test
(`apps/web/src/styles/tokens.test.ts`) som leser `tokens.css` direkte, så testen feiler hvis noen senere endrer en
farge så den blir vanskelig å lese. Eksempler: brødtekst 13,9:1 (lyst) og 15,2:1 (mørkt), hvit tekst på grønn knapp
6,4:1, kant på skjemafelt 3,9:1. I tillegg måler axe-core kontrasten på de ferdige sidene i nettleseren
(Playwright, begge temaer).

**Kjent avveining:** fokusringen (blå) har dårlig kontrast mot den grønne knappen den sitter på. Ringen er derfor
plassert 2 px *utenfor* elementet, mot sidebakgrunnen, der kontrasten er 5,9:1.

**Tema.** Standard er å følge operativsystemet (`prefers-color-scheme`). Brukeren kan overstyre til lyst eller mørkt i
Innstillinger. Valget lagres i nettleseren og settes av et lite skript i `index.html` *før* siden tegnes, slik at
mørkt tema ikke blinker hvitt ved innlasting (testet i Playwright).

## Typografi

- **Skrift:** Figtree (variabel, åpen lisens SIL OFL), med systemskrift som reserve. Skriften er pakket med appen
  (`@fontsource-variable/figtree`) i stedet for å hentes fra Google Fonts, fordi Google da får brukerens IP-adresse.
- **Skala:** 16 px grunnstørrelse med forhold 1,2: 12 / 14 / 16 / 19,2 / 23 px, og sidetittel som vokser med skjermen
  (`clamp(1.6rem, 1.3rem + 1.5vw, 2.074rem)`). Skjemafelt bruker alltid 16 px, ellers zoomer iOS inn ved fokus.
- **Tall:** beløp og mengder bruker `font-variant-numeric: tabular-nums`, så sifrene står under hverandre.
- Beløp vises i norsk format: `1 234,50 kr` med hardt mellomrom som tusenskille.

## Avstand, form og skygger

- Avstandsskala på 4 px-basis: 4, 8, 12, 16, 24, 32, 48, 64 px. 16 px er sidemarg på mobil.
- Hjørneradius: 6 px (felt), 12 px (kort og knapper), helt runde merkelapper.
- To skyggenivåer, svakt tonet med tekstfargen. I mørkt tema er skyggene svakere, og kantlinjer gjør jobben.
- Klikkflater er minst 44 × 44 px (knapper, menypunkter, avkrysningsboks med etikett).

## Brytepunkter og layout

| Brytepunkt | Hva endres |
|---|---|
| < 600 px | Én kolonne, bunnmeny, toppfelt med logo |
| ≥ 600 px | To kolonner på forsiden, mer luft i kortene |
| ≥ 900 px | Sidemeny med alle 10 seksjonene erstatter bunnmenyen |
| ≥ 1200 px | Tre kolonner på forsiden, bredere sidemeny |

**CSS Grid** brukes til de store strukturene:

- *App-skallet* (`AppShell.module.css`) bruker `grid-template-areas`: `"top" "main" "nav"` på mobil og
  `"side main"` fra 900 px.
- *Forsiden* (`OverviewPage.module.css`) bruker navngitte områder. Fra 1200 px tar «Går ut snart» to kolonner og to
  rader:

  ```css
  grid-template-areas:
    'expiring expiring budget'
    'expiring expiring actions'
    'dinner   waste    actions';
  ```

- *Bunnmenyen* er fem like kolonner (`repeat(5, minmax(0, 1fr))`).
- *Skjemarader og fargeprøver* bruker `repeat(auto-fit, minmax(…))`, så feltene står side om side når det er plass,
  uten media queries.

**Flexbox** brukes inne i komponentene: ikon og tekst i knapper, etikett/hjelp/feil/felt i skjemafelt, og
sentrerte tomtilstander.

## Navigasjon

- **Mobil:** bunnmeny med Oversikt, Matlager, Skann, Oppskrifter og Mer. «Skann» er en hevet, oransje knapp i midten
  fordi det er den raskeste måten å legge til varer på. «Mer» er en egen side (ikke en meny som legger seg over
  innholdet) med de seks andre seksjonene. Det er enklere å bruke med tastatur og skjermleser.
- **Bred skjerm:** sidemeny med alle 10 seksjonene (Oversikt, Matlager, Skann, Oppskrifter, Handleliste, Budsjett,
  Svinn, Måltidsplan, Husholdning, Innstillinger), fra én liste i `apps/web/src/app/navigation.ts`. I fase 1 var
  seksjonene som ikke var bygd, merket «Senere». Etter fase 11 er ingen merket slik.
- Aktiv side markeres med `aria-current="page"` og med bakgrunn, fet skrift og en strek – ikke bare farge.
- Ved sidebytte flyttes fokus til sidens overskrift, slik at skjermlesere leser opp den nye siden.

## Tilgjengelighet

Mål: WCAG 2.2 nivå AA (NFR-UX-002). Det som er gjort i fase 1:

- «Hopp til hovedinnhold»-lenke som første element ved tabulering.
- Alle skjemafelt har synlig `<label>`. Hjelpetekst og feilmelding kobles til feltet med `aria-describedby`, og
  feltet får `aria-invalid` ved feil. Valgfrie felt merkes «(valgfritt)» i stedet for å merke påkrevde.
- Feilmeldinger har ikon og tekst, og en usynlig «Feil:» foran for skjermlesere.
- Etter mislykket innsending får en feiloppsummering fokus, med lenker som flytter fokus til hvert felt.
- Synlig fokus med `:focus-visible` (3 px ring, 2 px avstand).
- Toast-meldinger leses opp (`aria-live="polite"`) og forsvinner ikke mens musepekeren eller fokus er på dem.
- `prefers-reduced-motion` slår av animasjoner.
- Native `<select>`, `<input type="date">` og avkrysningsboks, som fungerer med tastatur, skjermleser og
  mobilens egne velgere.
- Tallfelt bruker `inputmode="decimal"` i stedet for `type="number"`, fordi `type="number"` håndterer norsk
  desimalkomma dårlig.

### Varsler og svinn (fase 11)

- **Bjella** står i toppfeltet på telefon og øverst i sidemenyen på bred skjerm. Antallet nye varsler står i lenkens
  navn («Varsler, 3 nye»), så skjermlesere hører det. Merket på bjella er bare den synlige kopien.
- **Én live-region** sier «2 nye varsler» når antallet øker mens appen er åpen, ikke ved hver innlasting.
- **Varslene** har en farget kant etter alvor (fare, advarsel, info), men meningen står i teksten. «Avvis» har et
  navn med hele varselet, og fokus blir i listen når et varsel forsvinner.
- **Siste forbruksdag og best før** har ulik ordlyd. Rådet for best før («se, lukt og smak») brukes aldri om siste
  forbruksdag.
- **Svinnsiden:** tall som tekst, søyler som pynt, en ekte tabell for 12 måneder, og skravering i tillegg til farge for
  det som er anslått. Fire smale kolonner, så tabellen får plass på 360 px uten å skjule noe.
- **Toast-regionen** het «Varsler» fra fase 1. Den heter nå «Meldinger», så skjermlesere ikke får to landemerker med
  samme navn.

### Endringer i fase 2–13

Lagt til i fase 14. Detaljene og bevisene står i kapittel 11 og i [tilgjengelighet.md](../development/testing/tilgjengelighet.md).

- **Delte husholdninger (fase 10):** en velger for aktiv husholdning, og «Lagt til av» bare når husholdningen er delt.
  Knapper med et navn i («Fjern Ola») har navnet i `aria-label` fra i18n, fordi en skjult `<span>` ga «FjernOla».
- **Måltidsplanen (fase 9):** én blokk per måltid med overskrifter, ikke `section`, fordi like landemerker gjorde
  siden vanskelig å navigere med skjermleser (axe `landmark-unique`).
- **Fokus på telefon (fase 13):** `scroll-padding` på `html`, så et felt med fokus ikke havner bak toppfeltet eller
  bunnmenyen (WCAG 2.4.11), og fokusring på kalenderknappen i datofelt (2.4.7).
- **Kodedeling (fase 13):** hver side lastes når den åpnes. Det gjorde at fokus ved sidebytte kom før overskriften
  fantes, så hooken venter nå på `<h1>`.
- **Ny kontroll (fase 13):** `e2e/a11y.spec.ts` går gjennom hvert tabulatorstopp på alle sider, tester 200 % zoom,
  320 px, tekstavstand og redusert bevegelse.

## Hvordan designet ble testet og forbedret

Testing i fase 1 er automatisk og gjort av KI-verktøyet, ikke av brukere:

- axe-core på alle 12 sider, i lyst og mørkt tema, på 360 px og 1280 px (Playwright).
- Måling av at ingen side har horisontal rulling på 360 px, og at tekstene i bunnmenyen ikke kuttes.
- Kontrasttest av alle tokenpar (Vitest).
- Visuell gjennomgang av skjermbilder (`docs/evidence/screenshots/fase-1/`).

Forbedringer som kom ut av dette (se kapittel 11 for detaljer):

1. axe fant at lenkene i feiloppsummeringen var for små og tett plassert (WCAG 2.5.8). Rettet med høyere klikkflate.
2. Ikonet for Innstillinger lignet en sol og kunne forveksles med en temabryter. Byttet til glidebrytere.
3. Sidemenyens bakgrunn sluttet ved skjermhøyden på lange sider. Rettet ved å la bare innholdet være «sticky».
4. Fargeprøvene på designsystem-siden fikk bare én kolonne på mobil. Rettet.

**Ikke gjort per 2026-10-27:** testing med ekte skjermleser (VoiceOver, TalkBack eller NVDA), test på ekte telefon,
manuell tastaturtest av teamet og brukertesting. Sjekklisten for teamet står i
[tilgjengelighet.md](../development/testing/tilgjengelighet.md).
Automatiske verktøy finner bare en del av tilgjengelighetsproblemene.

## Kilder i prosjektet

- [ADR-0004: Ren CSS med tokens og CSS Modules](../development/architecture-decisions/0004-ren-css-uten-tailwind.md)
- [Fasespesifikasjon 01](../development/requirements/01-designsystem-og-app-skall.md)
- Kode: `apps/web/src/styles/tokens.css`, `apps/web/src/layout/`, `apps/web/src/components/`
- Testbevis: [docs/evidence/test-results/fase-1/](../evidence/test-results/fase-1/)
- Skjermbilder: [docs/evidence/screenshots/fase-1/](../evidence/screenshots/fase-1/)
