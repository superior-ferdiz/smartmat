# Presentasjon: forslag til disposisjon og demo-manus

> **Status: FORSLAG fra KI (Claude), fase 14, 2026-10-27.** Lengden på presentasjonen er ikke kjent. Forslaget er
> laget for 15 minutter og kan kortes ned. Hvem som viser hva, er bare et forslag. Det avgjør teamet. Ikke gjennomgått
> av teamet.

## Disposisjon (15 minutter)

| # | Del | Tid | Innhold | Kilde i rapporten | Forslag til hvem |
|---|---|---|---|---|---|
| 1 | Problem og målgruppe | 1,5 min | Problemstillingen med egne ord | Kap. 02 (teamet skriver) | Linus |
| 2 | Hva SmartMat gjør | 1 min | De fire delene: matlager, kjøp og budsjett, oppskrifter, handleliste og måltidsplan | Kap. 00 | Linus |
| 3 | **Demo** | 6 min | Manuset under | – | Begge (se manuset) |
| 4 | Arkitektur | 1,5 min | Ett diagram: nettleser → API → Postgres, worker, testmiljøet bak Caddy. Tre beslutninger: heltall i øre, kjøp som eneste kilde til utgifter, `household_id` på alt. | Kap. 07, ADR-0006–0008 | Ferdinand |
| 5 | Metode: SDD med KI | 2 min | Fasemalen, krav før kode, lagrede bevis, mutasjonskontroll. **Si tydelig at KI skrev koden.** | Kap. 06, 13, KI-erklæringen | Ferdinand |
| 6 | Testing og bevis | 1,5 min | 1364 enhetstester, 491 API-tester, 209 Playwright-tester, og hva som **ikke** er testet | [Bevisoversikt](../evidence/bevisoversikt.md) | Linus |
| 7 | Refleksjon | 1 min | Det dere har lært, med egne ord | Kap. 13 og 18 (teamet skriver) | Begge |
| 8 | Spørsmål | – | | | Begge |

**Viktig om del 5–7:** Sensor vil trolig spørre hvordan koden virker, og hva dere selv har gjort. Begge bør kunne
forklare minst innloggingen (sesjoner og CSRF), hvordan en husholdning ikke kan se en annens data (`householdAccess`),
og hvorfor beløp er heltall i øre. Bruk kapittel 10 (eksempel 1, 6 og 8) til å forberede dere.

## Forberedelser til demoen

Testmiljøet er `https://smartmat.risansolutions.no` (basic auth, brukernavn `smartmat`). Passordet står i
`/opt/Websites/smartmat-private/testmiljo-passord.txt`. **Ikke vis den filen eller passordet på skjermen**, og lukk
den i editoren før dere deler skjerm.

Per 2026-10-27 har testmiljøet 27 oppskrifter og 106 ingredienser, men **ingen brukere**. Registreringen er stengt.

1. **Lag to kontoer** med `create-user` (se [testmiljo.md](../development/testmiljo.md), steg 5), én for hver av dere.
   Bruk ikke et passord dere bruker andre steder.
2. **Legg inn testdata for hånd** i kontoen som skal vises (oppdiktet, ingen ekte kvitteringer eller
   personopplysninger), dagen før:
   - et månedsbudsjett, for eksempel 4 000 kr
   - 6–8 varer i matlageret, der minst én har *siste forbruksdag* i morgen og én har *best før* i går
   - 2 kjøp, ett med linjer som legges i matlageret
   - én kassering med årsak, så svinnsiden har noe å vise
3. **Inviter den andre kontoen** til husholdningen, så delingen kan vises.
4. **Øv på demoen på telefon og PC**. Det er også første test på ekte telefon (sjekklisten i
   [tilgjengelighet.md](../development/testing/tilgjengelighet.md)). Skriv ned det dere finner.

**Det som ikke virker i testmiljøet, og som ikke bør vises live:**
- Produktoppslag ved skanning er av (ingen kontaktadresse til Open Food Facts). En skannet kode gir det manuelle
  skjemaet. Det kan vises som «appen virker når tjenesten er av» (NFR-REL-001).
- Priser fra Kassalapp er av (ingen nøkkel). Bare egne priser vises.
- Kvitteringslesing: bruk ikke ekte kvitteringer i demoen. Vis heller skjermbildene i
  [`screenshots/fase-8/`](../evidence/screenshots/fase-8/).

## Demo-manus (6 minutter)

| Tid | Hvem (forslag) | Skjerm | Hva dere gjør | Hva dere sier |
|---|---|---|---|---|
| 0:00 | Linus | Telefon (eller 360 px) | Logg inn. Vis forsiden. | «Dette er det du ser når du åpner appen: det som går ut snart, budsjettet og forslag til middag.» |
| 0:40 | Linus | Telefon | Åpne Matlager. Vis varen med siste forbruksdag i morgen og varen med best før passert. | «Best før og siste forbruksdag er ulike ting. Appen sier aldri at du kan spise noe etter siste forbruksdag.» |
| 1:30 | Linus | Telefon | Legg til en vare med «Skann» → «Skriv inn strekkoden» → fyll ut. | «Strekkoden fyller ut produktet når oppslaget er på. Ingenting lagres uten at du bekrefter.» |
| 2:20 | Ferdinand | PC | Oppskrifter: vis rangeringen og forklaringen, åpne én. Vis merket «KI-utkast» og kilden. | «Oppskriftene er oversatt fra Wikibooks av KI og er ikke kontrollert av oss ennå. Det står på hver av dem.» |
| 3:10 | Ferdinand | PC | Legg det som mangler, på handlelisten. Huk av, legg i matlageret. | «Det som er kjøpt, går rett inn i lageret.» |
| 3:50 | Ferdinand | PC | Budsjett: registrer et kjøp med to linjer. Vis at forbruket endrer seg. | «Kjøpet er den eneste kilden til utgifter. Alt regnes ut fra kjøpene, i hele øre.» |
| 4:40 | Begge | PC + telefon | Den andre kontoen ser den nye varen på handlelisten (delt husholdning). | «Husholdningen deles med en engangslenke. Bare medlemmer ser dataene, og det sjekkes på serveren.» |
| 5:20 | Linus | Telefon | Svinn og varsler: vis månedens svinn og bjella. | «Tallene skiller mellom faktisk verdi, anslått verdi og ukjent verdi.» |
| 5:50 | – | – | Avslutt | |

Hvis noe feiler live: si det, og bytt til skjermbildene i `docs/evidence/screenshots/`.

## Lysbilder

Ikke laget. Når disposisjonen er godkjent, kan KI lage et utkast til lysbilder (for eksempel arkitekturdiagrammet
fra kapittel 07 og tabellen fra bevisoversikten). Teksten på lysbildene om refleksjon og læring bør dere skrive selv.
