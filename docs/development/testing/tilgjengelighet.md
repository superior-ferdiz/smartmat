# Tilgjengelighet: WCAG 2.2 AA-gjennomgang og sjekkliste for ekte telefon

**Status:** Skrevet av KI (Claude) i fase 13, 2026-10-27. Gjennomgangen er gjort av KI med automatiske tester og
lesing av koden. **Ingen i teamet har gått gjennom den, og ingenting er testet med skjermleser på ekte telefon.**
Spesifikasjon: [13-sikkerhet-drift.md](../requirements/13-sikkerhet-drift.md) (NFR-UX-005).

## Hvordan gjennomgangen er gjort

| Metode | Hva den dekker | Hvor |
|---|---|---|
| axe (WCAG 2.0–2.2 A og AA) på alle sider, i 360 px og 1280 px | Navn, roller, kontrast, skjemaetiketter, landemerker, målstørrelse | Playwright-testene for hver side, komponenttestene (`expectNoAxeViolations`) |
| Tastaturgang | Hvert tabulatorstopp på alle sider (opptil 150): fokus er synlig og ikke skjult bak topplinjen eller bunnmenyen | `e2e/a11y.spec.ts` (2.1.1, 2.4.7, 2.4.11) |
| Zoom og reflow | 640 CSS-px (= 200 % i et vindu på 1280 px) og 320 CSS-px, ingen rulling sidelengs | `e2e/a11y.spec.ts` (1.4.4, 1.4.10) |
| Tekstavstand | Linje 1,5, bokstav 0,12 em, ord 0,16 em, avsnitt 2 em, ingen rulling sidelengs | `e2e/a11y.spec.ts` (1.4.12) |
| Redusert bevegelse | Med «reduser bevegelse» varer ingen animasjon eller overgang mer enn 0,01 ms | `e2e/a11y.spec.ts` (2.3.3, AAA, tatt med fordi appen har animasjoner) |
| Kodegjennomgang (KI) | Kriterier som ikke kan måles automatisk på denne måten: se tabellen | Denne filen |

Sidene i kontrollene: oversikt, matlager (liste, ny vare, steder, én vare), skann, oppskrifter (liste, kilder, én
oppskrift), handleliste, budsjett (oversikt, nytt kjøp, ett kjøp), kvitteringer, måltidsplan, svinn, varsler,
husholdning, innstillinger, mer, profil, personvern, og uinnlogget: logg inn, registrer og personvern.

## Funn i fase 13, og hva som er rettet

| # | Funn | Kriterium | Rettet |
|---|---|---|---|
| 1 | På telefon havnet elementer med fokus bak den faste bunnmenyen når man tabbet nedover. Det gjaldt forsiden, oppskrifter, nytt kjøp, måltidsplan, husholdning og profil. | 2.4.11 Fokus ikke skjult | Ja: `scroll-padding` på `html` (global.css) |
| 2 | I Chromium er kalenderknappen i et datofelt et eget tabulatorstopp, og der hadde feltet ingen fokusring (`:focus-visible` treffer ikke). | 2.4.7 Synlig fokus | Ja: `input[type='date']:focus-within` (global.css) |
| 3 | Stedssiden (fase 3) satte knappenavnet sammen av synlig tekst og en skjult `<span>` med stedets navn. I jsdom ble det «Gi nytt navnKjøleskap» (fase 10). I en ekte nettleser blir det trolig riktig, men det er ikke kontrollert med skjermleser. | 4.1.2 / 2.5.3 | Ja: `aria-label` fra i18n med `{{name}}` («Gi nytt navn til Kjøleskap», «Slett Kjøleskap»), som på sidene fra fase 10 |

Kontrollen fant også to falske funn i sin første versjon: kortlenker som tegner ringen rundt hele kortet
(`:focus-within`). Selve kontrollen ble rettet, ikke siden.

## WCAG 2.2 AA, kriterium for kriterium

Kolonnen «Status»: **Automatisk** = testet i Playwright eller komponenttestene. **Kode (KI)** = KI har lest koden og
mener kravet er oppfylt; ikke bekreftet av et menneske. **Teamet** = må vurderes av folk, helst med skjermleser.
**Ikke relevant** = appen har ikke det kriteriet handler om.

| Kriterium | Status | Merknad |
|---|---|---|
| 1.1.1 Ikke-tekstlig innhold | Automatisk + kode (KI) | Ikoner har `aria-hidden`; kvitteringsbildet har alt-tekst. Diagrammer i svinn har tabell og tekst (FR-WASTE-005). |
| 1.2.x Tidsbaserte medier | Ikke relevant | Kameravisningen er ikke innhold. |
| 1.3.1 Informasjon og relasjoner | Automatisk + teamet | Overskrifter, lister, tabeller, `fieldset`/`legend`. Om strukturen gir mening opplest, må testes med skjermleser. |
| 1.3.2 Meningsfylt rekkefølge | Teamet | DOM-rekkefølgen følger det visuelle (Grid uten `order`), men opplesningen må høres. |
| 1.3.3 Sensoriske egenskaper | Kode (KI) | Ingen tekst sier «knappen til høyre» eller «den grønne». |
| 1.3.4 Retning | Kode (KI) | Ingen låsing av stående/liggende. |
| 1.3.5 Identifisere formål | Kode (KI) | `autocomplete`: `username`, `email`, `current-password`, `new-password`, `nickname`. |
| 1.4.1 Bruk av farge | Kode (KI) | Status (utløpt, budsjett) har tekst og ikon, ikke bare farge. |
| 1.4.3 Kontrast (minimum) | Automatisk | axe og `tokens.test.ts` (lyst og mørkt tema). |
| 1.4.4 Endring av tekststørrelse | Automatisk | 200 %: 640 CSS-px uten rulling sidelengs. Ikke testet med nettleserens tekststørrelse alene. |
| 1.4.5 Bilder av tekst | Kode (KI) | Ingen. |
| 1.4.10 Dynamisk tilpasning | Automatisk | 320 CSS-px uten rulling sidelengs. |
| 1.4.11 Kontrast for ikke-tekstlig innhold | Automatisk | Fokusring og kanter på skjemafelt i `tokens.test.ts`. |
| 1.4.12 Tekstavstand | Automatisk | Bare rulling sidelengs er sjekket, ikke tekst som klippes i høyden. |
| 1.4.13 Pekerfølsomt innhold | Kode (KI) | Ingen egne verktøytips; ett `title` i allergenmerknaden er nettleserens egen. |
| 2.1.1 Tastatur | Automatisk + teamet | Alle stopp nås med Tab. At alt kan *gjøres* (for eksempel måltidsplanen) med tastatur, er testet i deler i Playwright, ikke for alle flyter. |
| 2.1.2 Ingen tastaturfelle | Automatisk | Tab-runden kommer tilbake til starten på alle sider. Dialoger er native `<dialog>`. |
| 2.1.4 Hurtigtaster | Ikke relevant | Ingen hurtigtaster med én bokstav. |
| 2.2.1 Justerbar hastighet | Kode (KI) | Meldinger (toast) forsvinner etter 6 s, men stopper ved fokus og musepeker, og har ingen handlinger. Sesjonen varer i 14 dager. Tolkning: det er en statusmelding, ikke en tidsgrense. |
| 2.2.2 Pause, stopp, skjul | Kode (KI) | Ingenting beveger seg av seg selv utenom lastetilstanden. |
| 2.3.1 Tre glimt | Kode (KI) | Ingen blinking. |
| 2.4.1 Hoppe over blokker | Automatisk | «Hopp til innholdet» er første stopp. |
| 2.4.2 Sidetitler | Automatisk | `document.title` per side (`Page.tsx`). |
| 2.4.3 Fokusrekkefølge | Teamet | Fokus flyttes til overskriften ved sidebytte. Om rekkefølgen gir mening, må et menneske vurdere. |
| 2.4.4 Formål med lenker | Kode (KI) | Lenker har tekst eller `aria-label` fra i18n. |
| 2.4.5 Flere måter | Kode (KI) | Meny, «Mer» og søk i matlageret. |
| 2.4.6 Overskrifter og ledetekster | Teamet | Om tekstene er forståelige, må teamet vurdere. |
| 2.4.7 Synlig fokus | Automatisk | Etter funn 2. |
| 2.4.11 Fokus ikke skjult (minimum) | Automatisk | Etter funn 1. |
| 2.5.1 Pekerbevegelser | Kode (KI) | Ingen bevegelser med flere fingre eller sveip. |
| 2.5.2 Pekeravbrudd | Kode (KI) | Vanlige knapper (handling ved slipp). |
| 2.5.3 Etikett i navn | Automatisk + kode (KI) | Synlig tekst er med i tilgjengelig navn (for eksempel «Logg ut Safari på iPhone eller iPad»). |
| 2.5.4 Bevegelsesstyring | Ikke relevant | |
| 2.5.7 Dra-bevegelser | Kode (KI) | Ingen dra-og-slipp. |
| 2.5.8 Målstørrelse (minimum) | Automatisk | axe, og `--tap-target: 44px`. |
| 3.1.1 Språk på siden | Automatisk | `<html lang>` følger språkvalget. |
| 3.1.2 Språk på deler | Teamet | Oppskriftskilder har engelske titler; de er ikke merket `lang="en"`. Lite funn, ikke rettet. |
| 3.2.1 / 3.2.2 Fokus og inndata | Kode (KI) | Ingen automatisk navigering ved fokus eller valg; filtrene i matlageret oppdaterer listen, ikke siden. |
| 3.2.3 / 3.2.4 Lik navigering og identifisering | Kode (KI) | Menyene kommer fra én kilde (`navigation.ts`). |
| 3.2.6 Konsekvent hjelp | Ikke relevant | Ingen hjelpefunksjon. |
| 3.3.1–3.3.4 Feil og etiketter | Automatisk | Feilmeldinger ved feltet (`aria-describedby`), feiloppsummering, bekreftelse før sletting. |
| 3.3.7 Overflødig inndata | Kode (KI) | Ingen flyt ber om det samme to ganger. |
| 3.3.8 Tilgjengelig autentisering | Kode (KI) | Passord kan limes inn og fylles ut av passordbehandler; ingen gåter. |
| 4.1.2 Navn, rolle, verdi | Automatisk | axe og komponenttestene. |
| 4.1.3 Statusmeldinger | Automatisk | Én region for meldinger («Meldinger»), varsler via `NotificationAnnouncer`. |

## Sjekkliste for ekte telefon (teamet fyller ut)

Dette kan bare testes av mennesker. Bruk testmiljøet (`smartmat.risansolutions.no`) når det er satt opp, med
testdata. Skriv dato, telefon, system og hvem som testet. Lagre notater (ikke skjermbilder med ekte opplysninger) i
`docs/evidence/`.

**Oppsett:** iPhone med VoiceOver (Innstillinger → Tilgjengelighet → VoiceOver), Android med TalkBack (Innstillinger →
Tilgjengelighet → TalkBack). Test også med stor tekst (iOS «Større tekst», Android «Skriftstørrelse» på største) og
med «Reduser bevegelse» på.

| # | Hva | VoiceOver (iPhone) | TalkBack (Android) |
|---|---|---|---|
| 1 | Logg inn med skjermleser: felt og feilmeldinger leses opp med navn, og feil passord sies tydelig | | |
| 2 | Sveip gjennom forsiden: rekkefølgen gir mening, og overskriftene kan brukes til å hoppe (rotor / lesekontroller) | | |
| 3 | Bunnmenyen: hver knapp leses med navn, og den valgte siden sies som valgt | | |
| 4 | Legg til en vare med skjermleser: datofeltet (best før / siste forbruksdag) kan fylles ut | | |
| 5 | Etter lagring: meldingen «… er lagt til» leses opp uten at man må lete etter den | | |
| 6 | Varselklokken: antall nye varsler leses opp, og varslene kan avvises | | |
| 7 | Handlelisten: å huke av en vare sies som avhuket, og to telefoner i samme husholdning ser endringen | | |
| 8 | Måltidsplanen: et måltid kan legges til, flyttes og fjernes uten å se skjermen | | |
| 9 | Skann: «Start kamera» og «Skriv inn strekkoden» kan brukes med skjermleser | | |
| 10 | Svinn: diagrammet har en tabell som leses fornuftig | | |
| 11 | Profilen: «Hvor du er logget inn» leser enheten og «Denne enheten»; «Logg ut» sier hvilken enhet | | |
| 12 | Meldingen om ny innlogging: blir funnet øverst på siden, og «Det var meg» virker | | |
| 13 | Største tekststørrelse: ingen tekst blir kuttet, og ingenting må rulles sidelengs | | |
| 14 | «Reduser bevegelse» på: ingen animasjoner | | |
| 15 | Mørk modus: alt kan leses | | |

**Det som er usikkert og må vurderes av teamet:** om tekstene er forståelige (2.4.6, 3.3.2), om rekkefølgen gir mening
opplest (1.3.2, 2.4.3), og om flyter som måltidsplanen er praktiske å bruke uten å se skjermen. Ingen i målgruppen har
testet appen.
