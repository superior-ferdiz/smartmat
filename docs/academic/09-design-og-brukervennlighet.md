# Design og brukervennlighet

> **Status: UTKAST.** Første versjon skrevet etter fase 1 (2026-10-20). Innholdet beskriver det som faktisk er
> implementert og testet i fase 1, men er skrevet av KI (Claude) og ikke gjennomgått av teamet ennå.
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
- **Ærlige plassholdere.** Seksjoner som ikke er bygget ennå, sier hvilken fase de kommer i. Eksempeldata på forsiden
  er merket «Eksempeldata» både i et varsel øverst og på hvert kort.

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
| ≥ 900 px | Sidemeny med alle 9 seksjonene erstatter bunnmenyen |
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
  innholdet) med de fem andre seksjonene. Det er enklere å bruke med tastatur og skjermleser.
- **Bred skjerm:** sidemeny med alle 9 seksjonene. Seksjoner som kommer senere (Måltidsplan, Husholdning) er merket
  «Senere».
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

**Ikke gjort ennå:** testing med ekte skjermleser (NVDA/VoiceOver), manuell tastaturtest av teamet og brukertesting.
Automatiske verktøy finner bare en del av tilgjengelighetsproblemene.

## Kilder i prosjektet

- [ADR-0004: Ren CSS med tokens og CSS Modules](../development/architecture-decisions/0004-ren-css-uten-tailwind.md)
- [Fasespesifikasjon 01](../development/requirements/01-designsystem-og-app-skall.md)
- Kode: `apps/web/src/styles/tokens.css`, `apps/web/src/layout/`, `apps/web/src/components/`
- Testbevis: [docs/evidence/test-results/fase-1/](../evidence/test-results/fase-1/)
- Skjermbilder: [docs/evidence/screenshots/fase-1/](../evidence/screenshots/fase-1/)
