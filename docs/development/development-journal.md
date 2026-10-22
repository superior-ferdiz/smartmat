# Utviklingslogg

Føres fortløpende. Bare faktiske hendelser. Hver oppføring sier hvem som var med, og hva som ble gjort av KI og hva av teamet.

---

## 2026-10-19 – Fase 0: oppstart og planlegging

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i denne økten.

**Hva skjedde**
- Ferdinand ga Claude en omfattende prosjektbeskrivelse (produktprompt) for SmartMat.
- Claude kartla utviklingsmiljøet (Ubuntu 22.04, Node 22, Docker) og fant at det ikke fantes noe eksisterende SmartMat-arbeid eller kursdokumenter på maskinen.
- Claude foreslo teknologivalg, MVP-omfang, risikoer, datamodell, mappestruktur og milepæler.
- Ferdinand avklarte:
  - teamet er Ferdinand Risan og Linus Saxe Huseby (prompten nevnte et annet navn ett sted; det var feil)
  - mappen heter `SmartMat`
  - kursdokumentene skal ikke legges inn; fokus er på produktet og dokumentasjonen av utviklingen
  - Git utsettes
  - appen kjøres lokalt foreløpig
  - hver fase skal gjennomføres i en egen chat
- Ferdinand godkjente planen og beslutningene overordnet ("looks good to me").

**Resultat:** Mappestruktur, `CLAUDE.md`, veikart, ADR-0001–0012, datamodellutkast, kravoversikt og maler for akademisk dokumentasjon.
Alt innhold er skrevet av KI og er ikke gjennomgått i detalj av teamet.

**Neste:** Teamet (begge) bør lese ADR-ene og kravoversikten. Deretter fase 1 i ny chat.

---

## 2026-10-19/20 – Fase 1: designsystem og app-skall

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i denne økten.

**Hva skjedde**
- Ferdinand startet fase 1 med en detaljert prompt (omfang, komponenter, testkrav, «ikke generisk AI-SaaS-utseende»).
- Claude leste CLAUDE.md, veikartet, ADR-ene, kravoversikten og utviklingsloggen, og svarte med fasemalen. Svaret
  inneholdt et forslag til fargepalett (med utregnet kontrast), typografi (Figtree), 9 seksjoner og 5 åpne spørsmål.
- Ferdinand godkjente planen med «All good» (2026-10-20). Spørsmålet om å innføre Git ble ikke besvart, så Git er
  fortsatt ikke innført.
- Claude skrev fasespesifikasjonen `requirements/01-designsystem-og-app-skall.md` og implementerte deretter fasen.
  All kode i fasen er skrevet av KI.

**Avvik fra planen og funn underveis** (detaljer i kapittel 10 og 11)
- Versjoner: TypeScript 6.0 (ikke 7), ESLint 9 (ikke 10), react-router 7 (ikke 8) og Vite 7 (ikke 8), på grunn av
  avhengigheter som ikke passer sammen og Node-versjonen på maskinen. npm krasjet til Vite ble låst med `overrides`.
- `exactOptionalPropertyTypes` ble fjernet fra TypeScript-oppsettet igjen.
- Flere feil ble funnet av testene og rettet: misvisende feilmelding for store beløp (Zod 4), for små lenker i
  feiloppsummeringen (axe, WCAG 2.5.8), manglende oversettelsesnøkler (TypeScript), usynlige tegn i kildekoden (ESLint).
- Skjermbildene viste at ikonet for innstillinger lignet en sol, og at sidemenyens bakgrunn stoppet på lange sider.
  Begge er rettet.
- Skriptet som lagret testbevis rapporterte først feil exit-kode. Det ble rettet, og alle bevisfiler ble laget på nytt.

**Resultat:** Alle sjekker grønne (typesjekk, lint, formatering, 233 enhetstester, bygg, 63 Playwright-tester,
0 sårbarheter). Bevis i `docs/evidence/test-results/fase-1/`, skjermbilder i `docs/evidence/screenshots/fase-1/`.

**Ikke gjort:** teamets gjennomgang av koden, manuell test med skjermleser/tastatur, testing i Firefox/Safari.

**Neste:** Teamet går gjennom fase 1 (se «Til gjennomgang» i [01-designsystem-og-app-skall.md](requirements/01-designsystem-og-app-skall.md)).
Deretter fase 2 (database og autentisering) i ny chat. Git bør innføres før fase 2 (ADR-0012).

---

## 2026-10-20 – Git innført

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med.

- Ferdinand opprettet et privat, tomt repo på GitHub (`superior-ferdiz/smartmat`) og ga Claude adressen.
- Claude skrev ADR-0013 (erstatter Git-delen av ADR-0012), sjekket at ingen hemmeligheter eller genererte filer kom med,
  og laget første commit med fase 0 og fase 1. Commiten står med Ferdinands Git-identitet og har en
  `Co-Authored-By: Claude`-linje, fordi innholdet er skrevet av KI.
- Ikke avklart: arbeidsflyt (direkte på `main` eller via pull requests). Linus skal inviteres som samarbeidspartner.

---

## 2026-10-20 – Fase 2: database og autentisering

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i denne økten.

**Hva skjedde**
- Ferdinand startet fase 2 med en detaljert prompt. Den bestemte arbeidsflyten med Git: grenen `fase-2`, commit og
  push bare på forespørsel, og teamet oppretter og godkjenner pull requesten. Prompten satte også omfanget og
  sikkerhetskravene.
- Prompten hadde to plassholdere som ikke var fylt ut: om fase 1 er gjennomgått, og arbeidsfordelingen. Claude
  påpekte dette i planen. Ferdinand svarte «Godkjent vennligst begynn og gjør fase 2» uten å fylle dem ut. Derfor er
  **fase 1 fortsatt registrert som ikke gjennomgått**, og planens forslag til arbeidsfordeling gjelder: KI
  implementerer, teamet gjennomgår via pull request.
- Claude svarte med fasemalen (Postgres på port 55432, API på 3100) og sju åpne spørsmål. Forslagene ble godkjent
  samlet, ikke hvert for seg (se tabellen i [spesifikasjon 02](requirements/02-database-og-autentisering.md)).
- Claude laget grenen `fase-2`, startet Postgres-containeren `smartmat-postgres` (ingen andre containere ble rørt)
  og implementerte fasen. **All kode i fasen er skrevet av KI.** Spesifikasjon 02 ble skrevet i samme økt, ikke før
  koden, slik CLAUDE.md beskriver.

**Avvik og funn underveis** (detaljer i kapittel 10–12)
- `prisma@latest` pekte på en release-kandidat (8.0). Vi bruker 7.10.1.
- **Tre feil i appen ble funnet og rettet:**
  - cookien utløp etter 14 dager selv om sesjonen ble forlenget ved bruk
  - `?neste` ble ignorert etter innlogging
  - språket fra kontoen ble ikke brukt ved ny sidelasting
- **To feil i testene:** feil rekkefølge på argon2-parametere, og en «annen enhet» som delte sesjon med den første.
- Alle API-testene passerte første gang. Derfor ble sikkerhetstestene kontrollert ved å slå av hver beskyttelse i
  koden. Alle seks endringene ble fanget.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 331 |
| API-tester mot database | 47 |
| Bygg | Vellykket |
| Playwright-tester | 95 |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-2/`, skjermbilder i `docs/evidence/screenshots/fase-2/`.

**Ikke gjort:**
- teamets gjennomgang av fase 1 og fase 2
- commit og push (ikke bedt om ennå)
- manuell test med skjermleser
- testing i Firefox og Safari

**Neste:** Teamet går gjennom fasen (se «Til gjennomgang» i spesifikasjon 02), ber om commit og push, og oppretter
pull requesten. Deretter fase 3 (matlager) i ny chat.

**Oppfølging 2026-10-21:** Ferdinand svarte «Alt er good vennligst fortsett» og ba om commit og push av `fase-2`.
Han valgte at en gjennomgang skal registreres, men oppga ikke hvem som gikk gjennom eller hva som ble sett på. Derfor
er ingen gjennomgang av fase 1 eller fase 2 registrert ennå. Den føres inn når detaljene er gitt.

---

## 2026-10-21 – Fase 3: matlager

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med.

**Hva skjedde**
- Ferdinand ba om å starte fase 3 i **samme chat** som fase 2 («begynn på fase 3 nå»), selv om arbeidsflyten sier
  én chat per fase. Han sa at registreringen av gjennomgangen kommer senere.
- Claude svarte med fasemalen og seks åpne spørsmål. Ferdinand svarte «godkjent», og anbefalingene gjelder
  (se tabellen i [spesifikasjon 03](requirements/03-matlager.md)).
- Claude laget grenen `fase-3` fra `fase-2`, fordi `fase-2` ikke er merget til `main`. Spesifikasjon 03 ble
  skrevet **før** koden denne gangen. **All kode i fasen er skrevet av KI.**

**Avvik og funn underveis** (detaljer i kapittel 8, 10 og 11)
- **`prisma migrate reset` nekter** å kjøre når den startes av et KI-verktøy. Løpenummeret `seq` ble derfor en egen
  migrering, og ingen data ble slettet.
- **Feil som ble funnet og rettet før de kom ut:**
  - `RESTRICT` på fremmednøkkelen fra parti til sted
  - ingen entydig «siste hendelse» for angring
  - en velger halvveis bak bunnmenyen på 360 px (axe)
  - et skjermbilde med historikken ikke ferdig lastet
- **Kontrollen av testene:** Første kjøring av skriptet testet ikke det ene tilfellet, fordi søketeksten ikke
  traff. Det ble oppdaget, rettet og kjørt på nytt.
- **Kjent fallgruve igjen:** Skript gjorde `\u00A0` om til usynlige tegn. Et rydde-skript endret i tillegg en
  kommentar i fase 1-koden (`ore.ts`). Den ble satt tilbake.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 426 |
| API-tester mot database | 81 |
| Bygg | Vellykket |
| Playwright-tester | 107 |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-3/`, skjermbilder i `docs/evidence/screenshots/fase-3/`.

**Ikke gjort:**
- teamets gjennomgang av fase 1–3
- commit og push av `fase-3` (ikke bedt om ennå)
- manuell test med skjermleser og på ekte telefon

**Neste:** Teamet går gjennom fasen. Deretter fase 4 (kjøp og budsjett), helst i en ny chat.

---

## 2026-10-21 – Fase 4: kjøp og budsjett

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med.

**Hva skjedde**
- Ferdinand startet fase 4 i en ny chat med en detaljert prompt. Den bestemte omfanget, at grenen `fase-4` skulle
  lages fra `fase-3`, og at planen skulle vise hva som er KI-ens og hva som er teamets del.
- Claude påpekte at hele fase 3 ikke var committet. Hadde grenen blitt laget da, ville fase 3 havnet i samme pull
  request som fase 4.
- Ferdinand svarte: «Godkjennt du kan committe jeg har gått igjennom alt.» Anbefalingene i de åtte åpne spørsmålene
  gjelder (se tabellen i [spesifikasjon 04](requirements/04-kjop-og-budsjett.md)).
- **Om gjennomgangen:** Ferdinand oppga ikke hva «alt» omfatter (planen for fase 4 eller koden i fase 1–3), hvordan
  gjennomgangen ble gjort, eller om Linus var med. Utsagnet er registrert ordrett, men fase 1–3 er ikke satt til
  «Ferdig» i veikartet før dette er avklart.
- Claude committet fase 3 (856e68b, ikke pushet) og laget `fase-4` fra den commiten. Spesifikasjon 04 ble skrevet
  **før** koden. **All kode i fasen er skrevet av KI.**
- Arbeidet ble avbrutt én gang (økten ble brutt mens testene kjørte). Ferdinand ba om å fortsette. Filene som var
  skrevet før avbruddet (blant annet `e2e/budget.spec.ts`), ble lest gjennom igjen før arbeidet gikk videre.

**Avvik og funn underveis** (detaljer i kapittel 8, 10 og 11)
- Prisma foreslo `SET NULL` på kategorien til kjøpslinjer. Det ble endret til `RESTRICT` før migreringen ble kjørt.
- **Kontrollen av testene fant to hull** i første kjøring: filteret på husholdning i repoet ved retting, og
  «urørt»-regelen for flyttede partier. To nye tester ble skrevet, og alle 16 endringer ble fanget i andre kjøring.
  Begge kjøringene er lagret.
- En API-test ble logget ut fordi den flyttet klokken 20 dager frem på én gang (sesjoner utløper etter 14 dager).

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 505 |
| API-tester mot database | 129 |
| Bygg | Vellykket |
| Playwright-tester | 115 |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-4/`, skjermbilder i `docs/evidence/screenshots/fase-4/`.

**Ikke gjort:**
- teamets gjennomgang av fase 4 (og en avklaring av hva gjennomgangen av fase 1–3 omfattet)
- manuell test med skjermleser og på ekte telefon

**Neste:** Teamet går gjennom fasen og ber om commit og push. Deretter fase 5 (oppskrifter), helst i en ny chat.

**Oppfølging 2026-10-21:** Claude spurte hva gjennomgangen omfattet, og om `fase-4` skulle committes og pushes.
Ferdinand svarte «ja». Det ble tolket som ja til commit og push av `fase-4` og push av `fase-3`. Hva gjennomgangen
omfattet, er fortsatt ikke avklart.

---

## 2026-10-21 – Fase 5: oppskrifter

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med.

**Hva skjedde**
- Ferdinand startet fase 5 i en ny chat med en detaljert prompt: omfang, Git-regler, KI-ens og teamets del, at
  KI-skrevne oppskrifter ikke skal presenteres som teamets, og at det aldri skal påstås at noe er allergenfritt.
- Linjen i prompten om hva som er gjennomgått av fase 1–4 var ikke fylt ut. Claude påpekte det. Ferdinand svarte
  «godkjennt vennligst fortsett», uten å fylle den ut. **Ingen gjennomgang av fase 1–4 er derfor registrert.**
- Anbefalingene i de sju åpne spørsmålene gjelder (se [spesifikasjon 05](requirements/05-oppskrifter.md)). Viktigst:
  **teamet skriver oppskriftene selv.** KI har ikke skrevet noen oppskrift med `source=team`.
- Claude laget grenen `fase-5` fra `fase-4`, fordi `fase-4` ikke er merget til `main`. Spesifikasjon 05 ble skrevet
  **før** koden. **All kode i fasen er skrevet av KI.** KI laget også et utkast til ingredienslisten (61
  ingredienser med aliaser, allergener og omregninger, merket i filen) og tre fiktive testoppskrifter som bare
  finnes i test-databasene.
- Ferdinand spurte underveis «All good?». Claude svarte at to ting gjensto (et hull i testene og en ustabil test).
  Begge ble rettet før sluttkjøringen.

**Avvik og funn underveis** (detaljer i kapittel 8, 10 og 11)
- Regelen for uavgjort i matchingen («så flest tegn») var i praksis gjetting og ble fjernet.
- Claude så på sine egne skjermbilder og fant to feil: samme varenavn ble vist to ganger, og filtrene fylte hele første
  skjermbilde på telefon. To knapper het også «Endre» på varesiden.
- **Kontrollen av testene fant et hull i første kjøring** (allergener fra valgfrie ingredienser), og viste at én
  enhetstest var ustabil. Etter rettingene ble alle 20 endringer fanget i andre kjøring. Begge kjøringene er lagret.
- **Eldre axe-tester feilet på telefon** fordi oppskriftslisten og profilen ble lange nok til at elementer havnet
  bak bunnmenyen. Plasseringen ble målt før testene ble endret. Testene bruker nå et vindu like høyt som siden.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 637 |
| API-tester mot database | 158 |
| Bygg | Vellykket |
| Playwright-tester | 125 |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-5/`, skjermbilder i `docs/evidence/screenshots/fase-5/`.

**Ikke gjort:**
- **teamets oppskrifter** (ingen er skrevet). Appen viser «Ingen oppskrifter ennå» i utviklingsdatabasen.
- kontroll av allergenmerkingen og omregningene i `prisma/seed/ingredients.json` (KI-utkast)
- teamets vurdering av behandlingsgrunnlaget for allergier (GDPR art. 9, se kapittel 12)
- teamets gjennomgang av fase 1–5
- commit og push av `fase-5` (ikke bedt om ennå)
- manuell test med skjermleser og på ekte telefon

**Neste:** Teamet skriver oppskrifter (mal i `prisma/seed/README.md`), kontrollerer ingredienslisten, går gjennom
fasen og ber om commit og push. Deretter fase 6 (handleliste), helst i en ny chat.

**Oppfølging 2026-10-21:** Ferdinand skrev: «Vi har gått igjennom det i plenum.» Det er registrert ordrett som
hans erklæring om en felles gjennomgang. Det er ikke oppgitt hvem som deltok, om det gjelder fase 5 alene eller
også fase 1–4, eller hva som ble sett på (plan, kode eller den kjørende appen), og ingen funn er meldt. Fasen er ikke
satt til «Ferdig», fordi teamets oppskrifter og kontrollen av ingredienslisten fortsatt mangler. `fase-5` er ikke
committet. Ferdinand ba om prompten til fase 6.

---

## 2026-10-21 – Fase 6: handleliste

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet fase 6 i en ny chat med en detaljert prompt. To linjer var ikke fylt ut: om `fase-5` var
  committet, og hvem som deltok i gjennomgangen. Claude påpekte at `fase-5` ikke var committet, og ventet.
- Ferdinand svarte: «Ja vennligst comitte og pushe. Jeg godkjenner plannen. Begge har gjennomgått.» Claude committet
  `fase-5` (3197771), pushet den og laget `fase-6` fra den. Anbefalingene i de seks åpne spørsmålene gjelder (se
  [spesifikasjon 06](requirements/06-handleliste.md)).
- **Om gjennomgangen:** «Begge har gjennomgått» er registrert som Ferdinands erklæring om at han og Linus har gått
  gjennom. Hva som ble gjennomgått (fase 5 alene eller også fase 1–4, og plan, kode eller app), og eventuelle funn,
  er ikke oppgitt. Linus har ikke bekreftet det selv i en økt.
- Spesifikasjon 06 ble skrevet **før** koden. **All kode i fasen er skrevet av KI.**

**Avvik og funn underveis** (detaljer i kapittel 8, 10 og 11)
- En avkrysningsboks kunne vise hake etter en avvist avhuking. Komponenttesten fant det.
- Claude så på sine egne skjermbilder og rettet tre ting: et felt som brøt linjen på 360 px, mengden vist to ganger
  på linjer fra én oppskrift, og to felt som begge het «Enhet» i dialogen for ny vare.
- **Kontrollen av testene fant to hull i første kjøring** (kappløp i repoet ved «Legg i matlageret», og
  tilbakerullingen ved feil), og én ugyldig mutasjon. Etter rettingene ble alle 22 endringer fanget i andre kjøring.
  Begge kjøringene er lagret.
- Kjent fallgruve igjen: et usynlig hardt mellomrom i en testfil.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 708 |
| API-tester mot database | 195 |
| Bygg | Vellykket |
| Playwright-tester | 135 |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-6/`, skjermbilder i `docs/evidence/screenshots/fase-6/`.

**Ikke gjort:**
- teamets gjennomgang av fase 6 (pull request)
- test av handlelisten på ekte telefon i butikk, og med skjermleser
- commit og push av `fase-6` (ikke bedt om ennå)
- fortsatt utestående fra fase 5: teamets oppskrifter og kontroll av `prisma/seed/ingredients.json`

**Neste:** Teamet går gjennom fasen og ber om commit og push. Deretter fase 7 (strekkodeskanning), helst i en ny chat.

---

## 2026-10-21/22 – Fase 7: strekkodeskanning

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet fase 7 i en ny chat med en detaljert prompt. Den bestemte omfanget og ba om to nye ADR-er:
  oppskrifter fra nett (som skal erstatte ADR-0009) og et lukket testmiljø med HTTPS (som skal erstatte
  hosting-delen av ADR-0012).
- Claude svarte med fasemalen og ventet. Ferdinand spurte hva User-Agent betyr, og svarte på to spørsmål:
  - behandlingsansvarlige for testmiljøet er «vi som studenter»
  - domenet skal være `smartmat.risansolutions.no` («ikke laget domene enda»)
  - serveren står i Tyskland og driftes av Ferdinand

  Han godkjente med «godkjent» 2026-10-22. Anbefalingene i de andre spørsmålene gjelder (se
  [spesifikasjon 07](requirements/07-strekkode.md)). Kontaktadressen til OFF er ikke valgt.
- Claude laget grenen `fase-7` fra `fase-6`, fordi ingenting er merget til `main`. Vilkårene til Open Food Facts ble
  lest og dokumentert, og spesifikasjon 07 og ADR-ene ble skrevet **før** koden. **All kode i fasen er skrevet av
  KI.** ADR-0014 og ADR-0015 er akseptert gjennom godkjenningen av planen. ADR-0016 er bare foreslått, og ingen
  oppskrifter er hentet eller skrevet.
- Claude rørte verken Caddy eller andre prosjekter:
  - Docker-bildet for testmiljøet ble bygd og røyktestet med midlertidige containere (`smartmat-smoke-*`), som så ble
    fjernet, også volumet. Bildet `smartmat-staging-app` (0,9 GB) står igjen på serveren.
  - To manuelle oppslag ble gjort mot OFF sitt testmiljø for å se formatet på svaret. Ingen test kaller OFF.

**Avvik og funn underveis** (detaljer i kapittel 8, 10, 11 og 12)
- **Grensen hos OFF er 15 oppslag i minuttet per IP**, ikke rundt 100 som planen sa. Serveren holder seg på 10.
- Strekkoden kom med i loggen gjennom URL-en. Det er rettet og testet.
- Playwright fant en feil komponenttestene ikke fant: skjemaet ble bygd på nytt etter bekreftelsen, og meldingen kom
  aldri.
- Kameraet ble testet i en ekte nettleser med Chromiums falske kamera og en generert strekkodevideo. Den første
  generatoren hadde feil i paritetstabellen, så strekkoden kunne ikke leses. Det ble funnet ved å sammenligne med
  zxing.
- **Kontrollen av testene fant ett hull i første kjøring** (husholdningsfilteret i `itemSummary`). Etter en ny test
  ble alle 30 endringer fanget i andre kjøring. Begge kjøringene er lagret.
- Første forsøk på sluttkjøringen ble avbrutt (kode 137) under API-testene. De ble kjørt på nytt for seg.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 863 |
| API-tester mot database | 241 |
| Bygg | Vellykket (hovedfil 739 kB; skanneren for seg) |
| Playwright-tester | 157 |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-7/`, skjermbilder i `docs/evidence/screenshots/fase-7/`.

**Ikke gjort:**
- teamets gjennomgang av fase 7 (pull request)
- DNS, passord for basic auth og oppsett av testmiljøet. Etter det: test på ekte telefon (sjekkliste i
  [testmiljo.md](testmiljo.md)).
- kontaktadresse i User-Agent til OFF, og API-skjemaet til OFF
- kontroll av tabellen fra OFF-kategorier (KI-utkast)
- vurdering og godkjenning av ADR-0016
- commit og push av `fase-7` (ikke bedt om ennå)
- fortsatt utestående fra fase 5: teamets oppskrifter og kontroll av `prisma/seed/ingredients.json`

**Neste:** Teamet går gjennom fasen og ber om commit og push. Når DNS er klar, settes testmiljøet opp. Deretter
fase 8 (kvitterings-OCR) eller oppskriftene etter ADR-0016, helst i en ny chat.

**Oppfølging 2026-10-22:** Ferdinand ville gå videre til neste fase og ordne DNS og resten av testmiljøet senere. Han
fikk prompten til fase 8 og ba om commit og push av `fase-7` («Committ og push nå»). Ingen gjennomgang av fase 7 er
oppgitt.

