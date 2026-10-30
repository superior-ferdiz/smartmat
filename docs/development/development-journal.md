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


---

## 2026-10-24 – Fase 8: kvitterings-OCR

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet fase 8 i en ny chat med en detaljert prompt. Den bestemte omfanget og satte regler for de ekte
  kvitteringene: aldri i Git, tester, logger eller dokumentasjon, og ingen skytjeneste uten godkjenning.
- **Kvitteringene:**
  - Prompten sa 6 kvitteringer i en privat mappe. Claude fant **3** (2 Extra, 1 Kiwi, ingen Rema 1000), og de lå
    som filer som ikke var lagt til i Git, i roten av repoet. Da kunne en `git add -A` ha lagt dem på GitHub.
    Den private mappen fantes ikke.
  - Claude så på bildene for å se kjede og format. Det ble sagt fra i svaret at det betyr at bildene er sendt til
    Claude (Anthropic).
- **Planen:**
  - Claude svarte med fasemalen og ventet.
  - Linjen i prompten om gjennomgang av fase 7 var ikke fylt ut. Claude påpekte det.
  - Ferdinand svarte: «Vi godkjenner alt i plenum. Fase 7 ble gjennomgått i plenum av både meg og Linus. Vennligst
    fortsett.» Det er registrert ordrett som hans erklæring. Hva som ble gjennomgått, er ikke oppgitt, og Linus har
    ikke bekreftet det selv i en økt.
  - Anbefalingene i de åpne spørsmålene gjelder (se [spesifikasjon 08](requirements/08-kvittering.md)).
- **Før koden:**
  - Bildene ble flyttet til `/opt/Websites/smartmat-private/kvitteringer/` (mappe 0700, filer 0600, sjekksummene
    kontrollert).
  - `.gitignore` og `npm run check:files` stopper nå bildefiler i repoet.
  - Grenen `fase-8` ble laget fra `fase-7`.
  - Spesifikasjon 08 ble skrevet **før** koden.
- **Fasit og pilotmåling:**
  - Claude skrev av fasiten fra bildene. Den ligger i den private mappen, og betalingsdelen er utelatt.
  - Ferdinand kontrollerte den: «Kontrollert og all good».
  - Målingen ble kjørt 6 ganger. Hver kjøring er lagret med samlede tall. Resultatet står i ADR-0017 (foreslått,
    foreløpig): Tesseract på serveren, og bare butikk, dato og total foreslås.
- **All kode i fasen er skrevet av KI.**

**Avvik og funn underveis** (detaljer i kapittel 11 og ADR-0017)
- **Første målekjøring målte forbehandlingen:** Tesseracts retningsgjenkjenning valgte feil retning på begge bildene
  som var tatt liggende, og beskjæringen fant ikke en smal kvittering. Det ble rettet, og kjøringen ble lagret.
- **Parseren ble justert etter å ha sett resultatene** på de samme tre kvitteringene. Det var åtte generelle
  rettinger, hver med en fiktiv test. Tallene er derfor sannsynligvis for gode. Kvitteringene som kommer senere,
  skal måles som et rent kontrollsett.
- Selvtesten av måleskriptet med en fiktiv kvittering fant at psm 4 kan miste beløpskolonnen, og at minnemålingen
  ikke ga Tesseract bildet.
- **Røyktesten av hele kjeden** (ekte pg-boss og Tesseract, fiktiv kvittering, midlertidig konto som ble slettet)
  fant at en kort kvittering som ligger på siden, ble lest i feil retning. Det ble rettet, og en test ble lagt til.
- pg-boss `singletonKey` hindrer ikke doble jobber. Det er ufarlig, og ble fjernet fra koden.
- Første formateringssjekk feilet på én fil. Den feilede kjøringen er lagret (`03-format-check-forsok1.txt`).
- I kapittel 8 manglet raden for migreringen fra fase 7. Den er lagt til.
- I kapittel 11 stod det at fase 7 hadde 8 migreringer. Bevisfilen sier 7. Det er rettet.
- **Kontrollen av testene** (37 endringer, med bare API-testene for kvitteringer og kjøp per endring, for å holde
  tiden nede):
  - Første kjøring fant tre hull: runde 16, 31 og 36. Nye tester ble lagt til.
  - Andre kjøring fanget 36 av 37. Runde 16 er en dobbel sperre som repoet stopper uansett. En ekstra mutasjon viser
    at den nye repotesten fanger den.
  - Loggtesten var ustabil (én feil av fem kjøringer). Den sannsynlige årsaken er at tall fra den fiktive kvitteringen
    kan stå inne i en tilfeldig id. Årsaken er ikke bekreftet. Testen er gjort robust.
  - Alle kjøringene er lagret.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 956 |
| API-tester mot database | 282 |
| Bygg | Vellykket (hovedfil 761 kB) |
| Playwright-tester | 163 |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-8/`, skjermbilder i `docs/evidence/screenshots/fase-8/`.

**Ikke gjort:**
- teamets gjennomgang av fase 8 (pull request) og godkjenning av ADR-0017
- de 3 kvitteringene som mangler (minst én fra Rema 1000), og en ny måling på dem som et rent kontrollsett
- sletting av de ekte kvitteringene, fasiten og måleresultatene i `/opt/Websites/smartmat-private/` (når ADR-0017 er
  godkjent, senest 2026-11-23)
- test på ekte telefon (punkt 11–14 i [testmiljo.md](testmiljo.md)), og testmiljøet satt opp
- commit og push av `fase-8` (ikke bedt om ennå)
- fortsatt utestående fra tidligere faser: DNS og passord for testmiljøet, kontaktadresse til Open Food Facts,
  kontroll av OFF-kategoritabellen, ADR-0016 og ingredienslisten

**Neste:** Teamet går gjennom fasen, tar stilling til ADR-0017, og legger de andre kvitteringene i den private
mappen. Deretter fase 9 (måltidsplan), helst i en ny chat.


**Oppfølging 2026-10-24:** Ferdinand ba om commit og push av `fase-8` («Commit og push fase 8»). Den ble committet
(f590468) og pushet samme dag, i chatten der fase 9 startet.

---

## 2026-10-24 – Fase 9: oppskrifter fra åpne kilder og måltidsplan

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet fase 9 med prompten for måltidsplanen og en beslutning om oppskriftene: «Oppskrifter på matretter
  skal hentes fra internett slik at det automatisk kommer opp oppskrifer på matretter som brukeren kan lage basert
  på hva de har.» Linjene om gjennomgang siden fase 8 og om ADR-0017 var ikke fylt ut. Claude registrerte dem som
  «ingen» og «ikke godkjent ennå».
- **Planen:**
  - Claude leste vilkårene til Spoonacular og TheMealDB og anbefalte bort fra begge (Spoonacular tillater ikke å
    lagre ingredienser, TheMealDB er bare for utvikling og på engelsk).
  - Forslaget var å importere fra Wikibooks (CC BY-SA 4.0), oversette med KI og merke oppskriftene som KI-utkast.
    Rangeringen fra fase 5 viser dem da automatisk etter matlageret.
  - Ferdinand svarte: «Godkjent i plenum av Ferdinand og Linus». Det er registrert ordrett som hans erklæring.
    Linus har ikke bekreftet det selv i en økt. Anbefalingene i de seks åpne spørsmålene gjelder.
  - Ingen kontaktadresse ble oppgitt. Importskriptet bruker GitHub-profilen til repoet i User-Agent.
- **Spesifikasjon 09 ble skrevet før koden.** ADR-0016 er akseptert og erstatter ADR-0009.
- **Oppskriftene:**
  - 46 sider ble hentet fra Wikibooks i to omganger, og originalene ble lest før oversettelsen. 27 ble oversatt.
  - Valgt bort fra første henting (13 av 32): 20-Minute Beef Stroganoff (ferdigprodukter), Chicken Tikka Masala
    (krever en annen oppskrift), Chicken with Paprika and Cream (bearbeidet ost, svært kort), Fried Rice, Tacos og
    Chicken Soup I (ingen mengder), Fried Fish (mikrobølgeovn og frityr), Dal, Lasagne, Chili con Carne og Meatloaf
    (oversikter, ikke oppskrifter), Chicken Curry (mange krydder som ellers ikke brukes) og Fish Pie (kamskjell og
    blåskjell).
  - Valgt bort fra andre henting (6 av 14): Meatloaf II (ferdig fyll), Pasta with Budget Bolognese Sauce (frosne
    hamburgere), Honey Mustard Salmon (bare forhold, ingen mengder), Cabbie Claw (ufullstendig, fisken skal henges
    i et døgn), Home Fries (en lenke som så ut som reklame) og Beef and Barley Stew (to blandede varianter).
  - Originalene til de som ble valgt bort, er slettet fra repoet.
- **All kode i fasen er skrevet av KI.** Oversettelsene og de 45 nye ingrediensene er også laget av KI.

**Avvik og funn underveis** (detaljer i spesifikasjon 09 og kapittel 11)
- Frødata rundet av før omregningen («½ løk» ble 100 g). Det ble rettet, og to eldre tester ble oppdatert.
- Meldingen etter «Fjern» kom ikke på telefon. Årsaken var fellen fra fase 7 (TanStack hopper over `onSuccess` når
  komponenten avmonteres). Playwright fant det.
- axe fant sju landemerker med samme navn.
- **Kontrollen av testene:** første kjøring fanget 31 av 35. Hullene var repoer som ikke filtrerte på husholdning selv,
  og en skjult oppskrift i måltidsplanen. Nye tester ble lagt til, og andre kjøring fanget 35 av 35.
- Første formateringssjekk feilet på én fil. Den feilede kjøringen er lagret.
- Et utkast til kapittel 11 sa at en ny test feilet med den gamle koden. Det var ikke kjørt, og teksten ble rettet.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 1058 |
| API-tester mot database | 317 |
| Bygg | Vellykket (hovedfil 803 kB) |
| Playwright-tester | 167 |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-9/`, skjermbilder i `docs/evidence/screenshots/fase-9/`.

**Ikke gjort:**
- teamets gjennomgang av fase 9 (pull request)
- **kontroll av de 27 oppskriftene og de nye ingrediensene** (mengder, tider, oversettelse, allergener). Til det er
  gjort, står de som KI-utkast.
- commit og push av `fase-9` (ikke bedt om ennå)
- test på ekte telefon
- fortsatt utestående fra tidligere faser: testmiljøet (DNS, passord, oppsett), kontaktadresse til Open Food Facts,
  kontroll av OFF-kategoritabellen og `ingredients.json`, ADR-0017 og de 3 kvitteringene som mangler, sletting av
  pilotdataene senest 2026-11-23

**Neste:** Teamet går gjennom fasen og kontrollerer oppskriftene. Deretter fase 10 (husholdning: invitasjoner,
roller, deling), helst i en ny chat.

**Oppfølging 2026-10-24:** Ferdinand ba om commit og push av `fase-9`. Den ble committet (92a8a34) og pushet samme
dag, og han fikk prompten til fase 10. Ingen gjennomgang av fase 9 er oppgitt, og ingen pull request er merget til
`main`.

---

## 2026-10-24/25 – Fase 10: husholdning – invitasjoner, roller og deling

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet fase 10 i en ny chat. Før planen førte Claude inn commit og push av fase 9 i journalen, KI-loggen
  og veikartet. Grenen `fase-10` ble laget fra `fase-9`, fordi ingenting er merget til `main`.
- **Plassholderne i prompten var ikke fylt ut:** gjennomgang siden fase 9, kontroll av oppskriftene og ADR-0017.
  Claude registrerte dem som «ingen», «ingen ennå» og «ikke godkjent ennå», og sa fra i svaret.
- **Planen:** fasemalen med sju åpne spørsmål og anbefalinger. Ferdinand godkjente med «godkjennt» uten å svare på
  spørsmålene enkeltvis, så anbefalingene gjelder (se [spesifikasjon 10](requirements/10-husholdning.md)):
  - flere husholdninger per bruker (høyst 5)
  - lenke som varer i 48 timer
  - nøyaktig én eier
  - automatisk overføring av eierskapet når en eier sletter kontoen
  - frivillig deling av allergier
  - medlemmer kan endre budsjettet
- **Spesifikasjon 10 og ADR-0018 ble skrevet før koden.** ADR-0018 er akseptert gjennom godkjenningen av planen.
- **All kode i fasen er skrevet av KI.**
- Ferdinand spurte underveis hvordan det lå an, og ba deretter om prompten til neste fase, og om commit og push
  hvis fasen var over. Fasen ble gjort ferdig først.

**Avvik og funn underveis** (detaljer i kapittel 11)
- **Løkke i nettappen:** den første regelen «en 404 henter sesjonen på nytt» gjaldt også sesjonsspørringen selv. Det
  ble en uendelig løkke i en komponenttest, til testprosessen gikk tom for minne. Regelen gjelder nå bare
  husholdningsdata.
- **`RequireAuth`** byttet ut hele siden med en feilmelding når en ny henting av sesjonen feilet i bakgrunnen. Det er
  rettet.
- **Navnet på et tidligere medlem** ble vist i varehistorikken. Det er rettet.
- **Knappenavn som «FjernOla»** for skjermlesere. Rettet på de nye sidene. Samme mønster finnes på stedssiden fra
  fase 3, og det er ikke rettet.
- **Kontroll av testene:**
  - første kjøring fanget 32 av 34, og to nye tester ble lagt til
  - andre kjøring fanget 33 av 34
  - runde 3 (manglende lås) ble bare fanget av en test som avhenger av timing. Det kom en ny test der en annen
    transaksjon holder låsen, og den fanger runde 3 hver gang.
  - alle kjøringene er lagret
- **Playwright under høy last:** serveren var hardt belastet av et annet prosjekt (`redis-server`), og det ble ikke
  rørt. To forsøk feilet og er lagret. Den ene feilen var en svakhet i en test fra fase 1, og den ble rettet. Det
  tredje forsøket besto.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 1104 |
| API-tester mot database | 356 |
| Bygg | Vellykket (hovedfil 836 kB) |
| Playwright-tester | 175 (tredje forsøk) |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-10/`, skjermbilder i `docs/evidence/screenshots/fase-10/`.

**Ikke gjort:**
- teamets gjennomgang av fase 10 (pull request), og teamets vurdering av behandlingsgrunnlaget for deling av
  allergier (art. 9)
- test med to ekte telefoner og telefonens delingsmeny
- fortsatt utestående fra tidligere faser:
  - testmiljøet (DNS, passord, oppsett)
  - kontaktadresse til Open Food Facts
  - kontroll av OFF-kategoritabellen, `ingredients.json` og de 27 oppskriftene
  - ADR-0017 og de 3 kvitteringene som mangler
  - sletting av pilotdataene senest 2026-11-23

**Neste:** Teamet går gjennom fasen. Deretter fase 11 (svinnstatistikk og varsler i appen), i en ny chat.

**Oppfølging 2026-10-25:** Ferdinand ba om prompten til fase 11, og om commit og push hvis fasen var over («Gi meg
promptet til neste fase, Inkludert push og committ dersom denne fasen er over»). Fasen ble gjort ferdig (andre
kontroll av testene, test for låsen, dokumentasjon), og `fase-10` ble så committet og pushet. Ingen gjennomgang av
fase 10 er oppgitt.

---

## 2026-10-25 – Fase 11: svinnstatistikk og varsler i appen

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet fase 11 i en ny chat med en detaljert prompt.
- **Plassholderne i prompten var ikke fylt ut:** gjennomgang siden fase 10, reglene fra fase 10, behandlingsgrunnlaget
  for deling av allergier, kontroll av oppskriftene og ADR-0017. Claude registrerte dem som «ingen», «ikke godkjent
  ennå», «ikke vurdert ennå», «ingen ennå» og «ikke godkjent ennå», og sa fra i svaret.
- Grenen `fase-11` ble laget fra `fase-10`, fordi ingenting er merget til `main`.
- **Planen:** fasemalen med seks åpne spørsmål og anbefalinger. Ferdinand svarte «Godkjent commit og push». Det er
  tolket som at planen er godkjent, og at fasen skal committes og pushes når den er ferdig. Anbefalingene gjelder
  (se [spesifikasjon 11](requirements/11-svinn-og-varsler.md)):
  - varsler regnes ut ved lesing, og bare brukerens tilstand lagres (ADR-0019)
  - innstillinger per bruker
  - faste grenser for budsjettet (80 % og 100 %)
  - ikke svinn i prosent av utgiftene
  - kasseringer for slettede varer forsvinner, som før
  - ikke varsel om medlemmer som kommer og går
- **Spesifikasjon 11 og ADR-0019 ble skrevet før koden.**
- **All kode i fasen er skrevet av KI.** Det gjelder også ordlyden i varslene.

**Avvik og funn underveis** (detaljer i spesifikasjon 11 og kapittel 11)
- **«Avvis» på handlelistevarselet ga 404** når noen hadde lagt til en linje etter at siden ble lastet. API-testen
  fant det. En eldre nøkkel godtas nå, og merket flyttes bare fram.
- **To landemerker het «Varsler»:** toast-regionen fra fase 1 og det nye kortet. axe fant det. Toast-regionen heter
  nå «Meldinger».
- **Testmønsteret for farlig ordlyd var for bredt:** «trygg» traff «mattrygghet». Mønsteret er strammet inn.
- **Sletting av kjøp mistet meldingen og navigeringen** på telefon i Playwright under høy last (forsøk 1, lagret).
  Årsaken var en feil fra fase 4 som varselspørringen gjorde mer sannsynlig. Den er rettet for kjøp og varer.
- **Kontroll av testene** (29 endringer):
  - første kjøring fanget 28 av 29. Testen for runde 22 var for svak, og den ble gjort sterkere
  - det kom også en test for sletting av konto, som kapittel 12 omtalte uten at det var testet
  - andre kjøring fanget 29 av 29
  - alle kjøringene er lagret

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 1178 |
| API-tester mot database | 395 |
| Bygg | Vellykket (hovedfil 864 kB) |
| Playwright-tester | 183 (tredje kjøring, første feilet) |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-11/`, skjermbilder i `docs/evidence/screenshots/fase-11/`.

**Ikke gjort:**
- teamets gjennomgang av fase 11 (pull request), og kontroll av ordlyden i varslene og teksten i kapittel 12
- test på ekte telefon med skjermleser (VoiceOver eller TalkBack), også med to telefoner i samme husholdning
- fortsatt utestående fra tidligere faser:
  - testmiljøet (DNS, passord, oppsett)
  - kontaktadresse til Open Food Facts
  - kontroll av OFF-kategoritabellen, `ingredients.json` og de 27 oppskriftene
  - ADR-0017 og de 3 kvitteringene som mangler
  - sletting av pilotdataene senest 2026-11-23
  - teamets vurdering av reglene fra fase 10 og av behandlingsgrunnlaget for deling av allergier

**Neste:** Teamet går gjennom fasen. Deretter fase 12 (prisdata, etter vilkårsavklaring), i en ny chat.

**Oppfølging 2026-10-25:** Godkjenningen («Godkjent commit og push») gjaldt også commit og push når fasen var ferdig.
`fase-11` ble committet og pushet etter at alle sjekkene var kjørt med den endelige koden. Ingen gjennomgang av fase
11 er oppgitt, og ingen pull request er merget til `main`.

---

## 2026-10-25 – Fase 12: priser (etter vilkårsavklaring)

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet fase 12 i en ny chat med en detaljert prompt.
- **Plassholderne i prompten var ikke fylt ut.** Claude registrerte dem slik og sa fra i svaret:

  | Plassholder | Registrert som |
  |---|---|
  | Gjennomgang siden fase 11 | ingen |
  | Ordlyden i varslene | ikke lest ennå |
  | Kapittel 12 og reglene fra fase 10 | ikke vurdert ennå |
  | Behandlingsgrunnlaget for deling av allergier | ikke vurdert ennå |
  | Kontroll av oppskriftene | ingen ennå |
  | ADR-0017 | ikke godkjent ennå |
  | Konto og nøkkel hos Kassalapp | har vi ikke |
- Grenen `fase-12` ble laget fra `fase-11`, fordi ingenting er merget til `main`.
- **Steg 1 – vilkår før kode:**
  - Claude leste Kassalapps FAQ (som er bruksvilkårene for Hobby), API-sidene, OpenAPI-filen, `llms.txt`, `ai.txt`,
    personvernerklæringen og «Om»-siden 2026-10-25.
  - Resultatet står i [integrations/kassalapp.md](integrations/kassalapp.md), med sitat og tolkning hver for seg.
  - Konklusjon: Hobby er lov for et studentprosjekt, og lagring er lov. Rema 1000, Kiwi og Coop er ikke med.
- **Planen:** fasemalen med sju åpne spørsmål og anbefalinger. Ferdinand godkjente med «Godkjennt» uten å svare på
  spørsmålene enkeltvis, så anbefalingene gjelder (se [spesifikasjon 12](requirements/12-priser.md)):
  - Kassalapp på Hobby, av uten nøkkel
  - bare siste pris per kjede, 6 timers hurtiglager
  - ingen fritekstsøk
  - gamle priser fra Rema 1000, Kiwi og Coop sammenfoldet og aldri i «billigst»
  - ingen partipris fra Kassalapp
  - merke på egne priser over 90 dager
  - anslag uten nye kall
- **Spesifikasjon 12 og ADR-0020 ble skrevet før koden.** ADR-0020 er akseptert gjennom godkjenningen av planen.
- **All kode i fasen er skrevet av KI.**

**Avvik og funn underveis** (detaljer i spesifikasjon 12 og kapittel 11)
- **Samtidige oppslag ga 500.** Playwright fant det. Det er rettet og testet.
- **Kontroll av testene** (36 endringer):
  - første kjøring fanget 35 av 36, og det kom en ny test mot repoet (runde 26)
  - andre kjøring fanget 36 av 36
  - alle kjøringene er lagret
- **To svakheter i eldre tester** ble synlige under høy last og med ny rekkefølge på testene:
  - høydemålingen i `useTallPhoneViewport` (fase 3)
  - videoen til det falske kameraet (fase 7)

  Begge er rettet. To fulle Playwright-kjøringer feilet på kameratesten og er lagret. Den tredje besto.
- **Serveren var hardt belastet** av et annet prosjekt hele økten (load average 19–28). Det ble ikke rørt.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 1293 |
| API-tester mot database | 442 |
| Bygg | Vellykket (hovedfil 881 kB) |
| Playwright-tester | 187 (tredje kjøring) |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-12/`, skjermbilder i `docs/evidence/screenshots/fase-12/`.

**Ikke gjort:**
- teamets gjennomgang av fase 12 (pull request) og teamets egen lesing av Kassalapps vilkår
- konto og nøkkel hos Kassalapp, og ett manuelt oppslag for å se svarformatet
- test på ekte telefon med skjermleser
- fortsatt utestående fra tidligere faser:
  - testmiljøet (DNS, passord, oppsett)
  - kontaktadresse til Open Food Facts (og eventuelt Wikimedia)
  - kontroll av OFF-kategoritabellen, `ingredients.json` og de 27 oppskriftene
  - ADR-0017 og de 3 kvitteringene som mangler
  - sletting av pilotdataene senest 2026-11-23
  - teamets vurdering av reglene fra fase 10, behandlingsgrunnlaget for deling av allergier og ordlyden i varslene

**Neste:** Teamet går gjennom fasen. Deretter fase 13 (sikkerhet, ytelse, tilgjengelighet, backup, hosting), i en ny
chat.

---

## 2026-10-25/27 – Fase 13: sikkerhet, personvern, backup, hosting, ytelse og tilgjengelighet

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet fase 13 i en ny chat med en detaljert prompt. Han skrev i tillegg at DNS var klart. Claude sjekket
  at A- og AAAA-postene pekte på serveren.
- **Plassholderne i prompten var ikke fylt ut:** gjennomgang siden fase 12, Kassalapp, ordlyden i varsler og priser,
  art. 9, oppskriftene, ADR-0017, passord til basic auth, produksjon og e-posttjeneste. De er registrert i
  spesifikasjon 13 (avgjørelse 9).
- **Planen:** fasemalen med prioritert rekkefølge, KI-ens og teamets del, lov og tolkning, og åtte åpne spørsmål.
  Ferdinand godkjente med «Godkjennt i plenum, vennligst fortsett!» uten å svare på spørsmålene enkeltvis, så
  anbefalingene gjelder. «I plenum» er registrert som hans erklæring.
- **Fase 12 ble committet lokalt** (18f0789) før grenen `fase-13` ble laget. **Pushen ble stoppet** av verktøyets
  sikkerhetssperre, fordi prompten sier «commit og push bare når jeg ber om det». Den venter på et uttrykkelig «push».
- **Spesifikasjon 13, ADR-0021 og ADR-0022** ble skrevet før koden. Vilkårene til Have I Been Pwned ble lest først.
- **På serveren**, med godkjenningen:
  - nettet `smartmat-edge`, med Caddy koblet til uten omstart
  - én linje i GhostWebsite-prosjektets compose-fil (kopi før endringen i `smartmat-private`)
  - testmiljøet startet
  - systemd-timere for backup, sjekk og gjenoppretting
  - hemmeligheter laget i filer uten å skrives ut
- **Passordhashen til basic auth:**
  - Ferdinand kjørte kommandoen 2026-10-27, men med `-it` havnet bare ledeteksten i filen.
  - Den nye kommandoen Claude ga, feilet med `EOF`, fordi den ikke sendte linjeskift. Det var Claudes feil.
  - Ferdinand spurte hvorfor han måtte gjøre det, og ba om commit og push. Claude laget da et tilfeldig passord rett i
    en privat fil (aldri vist i chatten) og la inn Caddy-blokken: validert, lastet inn og kontrollert over IPv4 og IPv6
    (`26-caddy-https.txt`). De andre nettstedene på serveren svarte 200 etterpå.
- **All kode i fasen er skrevet av KI**, også tofaktorinnloggingen og personvernerklæringen (merket som utkast).

**Avvik og funn underveis** (detaljer i spesifikasjon 13 og kapittel 11)
- **Eksempelfilen for testmiljøet virket aldri:** tomme verdier stoppet appen ved oppstart.
- **Svinnspørringen leste alle husholdningers hendelser** med realistiske data. Rettet.
- **Fokus bak bunnmenyen og manglende fokusring i datofelt** ble funnet og rettet.
- **Kodedelingen brøt fokus ved sidebytte.** Playwright fant det, og det er rettet med egen test.
- **En tidsbombe i en test fra fase 11** feilet fra 2026-10-27. Rettet.
- **Mutasjonssjekken** (27 endringer):
  - første kjøring fanget 24 av 27
  - to hull i egne tester ble rettet, og andre kjøring fanget dem
  - den siste mutasjonen gir samme oppførsel (forklart i kapittel 11)
- **Tre feilpåstander i KI-ens egen dokumentasjon** ble rettet før de ble stående.

**Resultat:** Alle sjekker er grønne:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil |
| Enhetstester | 1364 |
| API-tester mot database | 491 (andre kjøring) |
| Bygg | Vellykket (hovedfil 608 kB, ned fra 881 kB) |
| Playwright-tester | 209 (andre kjøring) |
| Backup-skriptene | 21 av 21 |
| Sårbarheter (`npm audit`) | 0 |

Bevis ligger i `docs/evidence/test-results/fase-13/`, skjermbilder i `docs/evidence/screenshots/fase-13/`.

**Ikke gjort:**
- kontoer til teamet i testmiljøet (`create-user`)
- e-post (FR-AUTH-006): ingen tjeneste; behovet er beskrevet i spesifikasjon 13
- produksjon: ikke bestemt
- teamets oppgaver:
  - kontaktadresse og behandlingsgrunnlag for allergier i personvernerklæringen
  - avtale med serverleverandøren
  - kopi av backup-passfrasen og `TOTP_ENCRYPTION_KEY` utenfor serveren
  - VoiceOver- og TalkBack-sjekklisten
  - teamets gjennomgang av fasen, særlig tofaktorkoden
- fortsatt utestående fra tidligere faser:
  - kontaktadresse til Open Food Facts
  - kontroll av OFF-kategoritabellen, `ingredients.json` og de 27 oppskriftene
  - ADR-0017 og de 3 kvitteringene som mangler
  - sletting av pilotdataene senest 2026-11-23
  - ett manuelt oppslag mot Kassalapp

**Neste:** Teamet går gjennom fasen. Deretter fase 14 (akademisk ferdigstilling), i en ny chat.

**Oppfølging 2026-10-27:** Ferdinand ba om commit og push og om prompten til fase 14. `fase-12` ble pushet, og
`fase-13` committet og pushet etter at Caddy-blokken var lagt inn og dokumentasjonen oppdatert. Ingen gjennomgang av
fase 12 eller 13 er oppgitt, og ingen pull request er merget til `main`.


---

## 2026-10-27 – Fase 14: akademisk ferdigstilling (KI-ens del)

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet fase 14 i en ny chat med en detaljert prompt. **Nesten alle plassholderne var ikke fylt ut.** De er
  registrert slik:

  | Plassholder | Registrert som |
  |---|---|
  | Gjennomgang siden fase 13 | ingen |
  | Kontoer i testmiljøet | ingen |
  | Test på ekte telefon med skjermleser | ikke gjort |
  | Passfrase og TOTP-nøkkel utenfor serveren | nei |
  | Kontaktadresse, art. 9, avtale med serverleverandøren | ikke valgt / ikke vurdert / ikke sjekket |
  | Kontroll av oppskrifter, `ingredients.json`, OFF-kategorier | ingen |
  | ADR-0017, pilotdataene | ikke godkjent, ikke slettet (frist 2026-11-23) |
  | Offisielle krav, frist, format, referansestil | ukjent |
- `origin/main` sto på 0f7296c, så grenen `fase-14` ble laget fra `fase-13`.
- **Planen:** fasemalen med en tabell over KI-ens og teamets del per kapittel og sju åpne spørsmål. Ferdinand
  godkjente med «godkjennt og fortsett» uten å svare på spørsmålene. Anbefalingene gjelder: APA 7, Markdown til
  formatet er kjent, statusnivået «kontrollert av KI», ingen møtenotater skrevet av KI, presentasjon for 15 minutter,
  én pull request fra `fase-14` til `main`.
- **All tekst i fasen er skrevet av KI.** De delene som skal være teamets egne ord, står tomme med spørsmål.

**Avvik og funn underveis**
- **Et tall i kapittel 11 var feil:** første mutasjonskjøring i fase 8 fanget 34 av 37, ikke 35. Funnet da
  mutasjonsrundene ble talt med et skript fra de lagrede utdataene.
- **Kravoversikten sa at spesifikasjonene har brukerhistorier.** Ingen av dem har det. Kapittel 04 sier det, og
  setningen er rettet. KI laget ikke brukerhistorier i etterkant som om de var brukt.
- **Utdatert tekst** i veikartet, README, endringsloggen, testmiljo.md og kapittel 07 og 09 (blant annet «Caddy venter
  på passordhashen», «9 seksjoner», «Eksempeldata», «cirka 604 kB»), og `apps/worker` i CLAUDE.md, som ikke finnes.
- **Kapittel 08 manglet tabellene fra fase 13.** Lagt til etter kontroll mot migreringene.
- **Feil i KI-ens egne utkast underveis**, rettet før de ble stående: årsakene til to feilede forsøk i bevisoversikten
  (skrevet fra hukommelsen, rettet etter å ha lest utdataene), at prisoppryddingen var «nattlig» (den kjører hvert 15.
  minutt), antallet WCAG-kriterier som må vurderes av folk (sju → seks), og et lovnummer for ekomloven som KI ikke
  var sikker på (fjernet).
- **Første formateringssjekk feilet** på det nye skriptet. Lagret og rettet.

**Resultat:** Ingen endring i appen. Kontrollkjøringen er grønn:

| Sjekk | Resultat |
|---|---|
| Typesjekk, lint, formatering | Ingen feil (formatering på andre forsøk) |
| Enhetstester | 1364 |
| API-tester mot database | 491 |
| Bygg | Vellykket (hovedfil 608 kB) |
| Playwright-tester | 209 |
| Sårbarheter (`npm audit`) | 0 |
| Lenker i dokumentasjonen | 526, 0 feil (første kjøring: 517, én brutt og rettet) |

Bevis ligger i `docs/evidence/test-results/fase-14/`.

**Teamets del som gjenstår** (se kapittel 20):
- egen tekst i kapittel 02, 03, 15 og 18, refleksjonen i 13, og vurderingene i 06, 14, 16 og 17
- lese, rette og signere KI-erklæringen
- gjennomgå og godkjenne kapitlene, velge referansestil, finne kravene til format og frist
- slå opp kildene merket «KI-kunnskap» før de siteres

**Forslag før `main` merges**
1. Én pull request fra `fase-14` til `main`. Grenene er stablet, så den inneholder fase 1–14. Gå gjennom commit for
   commit og skriv funnene i pull requesten, så gjennomgangen blir dokumentert.
2. Les særlig tofaktorkoden (`lib/totp.ts`, `modules/twoFactor/`, `loginSecondStep`) og autorisasjonen
   (`householdAccess`, `requireOwner`).
3. Fyll inn kontaktadressen i `/personvern`, og ta stilling til behandlingsgrunnlaget for allergier.
4. Ta vare på backup-passfrasen og `TOTP_ENCRYPTION_KEY` utenfor serveren.
5. Slett pilotdataene i `smartmat-private` når ADR-0017 er avgjort, senest 2026-11-23.
6. Lag kontoene i testmiljøet og gå gjennom sjekklisten for ekte telefon i `testing/tilgjengelighet.md`.
7. Kjør `npm run check` og `npm run test:e2e` selv før merge.

**Neste:** Teamet skriver sine deler og går gjennom fasen. Commit og push når Ferdinand ber om det.

## 2026-10-27 – Fase 14, del 2: registrering og sjekkliste

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet del 2 av fase 14 i en ny chat. Den eneste opplysningen som var fylt ut, var at fase 14 er
  committet (1cfee6f) og pushet 2026-10-27. KI sjekket det med `git log` og `git rev-parse origin/fase-14`. Resten av
  plassholderne var ikke fylt ut og er registrert slik:

  | Plassholder | Registrert som |
  |---|---|
  | Pull request `fase-14` → `main` | ikke oppgitt. `origin/main` står fortsatt på 0f7296c |
  | Kodegjennomgang (tofaktor, `householdAccess`) | ingen |
  | Teamets egen tekst (02, 03, 13, 15, 18, vurderingene i 06/14/16/17) | ingen |
  | KI-erklæringen | ikke lest, ikke signert |
  | Kapitler godkjent av teamet | ingen |
  | Kilder slått opp / lest selv | ingen |
  | Referansestil | ikke valgt (anbefalt APA 7) |
  | Offisielle krav, frist, format, sideantall, presentasjonslengde | ukjent |
  | Kontoer i testmiljøet | ikke laget |
  | Test på ekte telefon med skjermleser | ikke gjort |
  | Kontaktadresse, art. 9 | ikke valgt / ikke vurdert |
  | Passfrase og TOTP-nøkkel utenfor serveren | nei |
  | Kontroll av oppskrifter, `ingredients.json`, OFF-kategorier | ingen |
  | ADR-0017, pilotdataene | ikke godkjent, ikke slettet (frist 2026-11-23) |
- **Planen:** fasemalen med 14 åpne spørsmål. Ferdinand godkjente steg 1 (registrere commit og push) og steg 4
  (sjekklisten) med «Ja vennligst gjør det!», uten å svare på spørsmålene.
- Passordet til testmiljøet var igjen markert i editoren og ble dermed sendt med i chatten. KI anbefalte å bytte det.
  Det er ikke gjort, fordi det krever en endring i Caddyfile, som teamet må be om.

**Endret**
- Veikartet, rad 14: committet og pushet, lenke til sjekklisten, og at ingen gjennomgang er oppgitt.
- Ny [sjekkliste for merge og innlevering](sjekkliste-merge-og-innlevering.md) (utkast, ingen punkter krysset av).
- Kapittel 20: lenke til sjekklisten. Teksten sa at bare kapittel 07 har Mermaid-diagrammer. Kapittel 08 har også
  (7 og 6 diagrammer), og det er rettet.
- KI-loggen: #49 (commit og push av fase 14, som manglet) og #50 (denne økten).

**Resultat:** Ingen endring i appen. Lenkesjekk og formatering av dokumentasjonen, se
`docs/evidence/test-results/fase-14/`.

**Commit og push:** Ferdinand ba om det («committ og push»). Commit 4799326 på `fase-14`, pushet 2026-10-27, etter
søk etter hemmeligheter i endringene (ingen funnet). Ført i KI-loggen og endringsloggen 2026-10-29, på Ferdinands
oppfordring («Vennligst gjør det»), sammen med prompten til neste økt.

**Neste:** Teamet svarer på de åpne spørsmålene, går gjennom pull requesten og skriver sine deler. Neste økt er
fase 14, del 3, med samme prompt og plassholderne fylt ut.

## 2026-10-29 – Fase 14, del 3: kontoer i testmiljøet og registrering

**Deltakere:** Ferdinand Risan (i chat med Claude Code). Linus Saxe Huseby var ikke med i økten.

**Hva skjedde**
- Ferdinand startet del 3 av fase 14 i en ny chat. Han oppga at del 2 er committet (4799326, 4522b36) og pushet, og at
  4522b36 ikke var ført i KI-loggen. KI sjekket det med `git log` og `git fetch`: `origin/fase-14` = 4522b36,
  `origin/main` = 0f7296c. Om pull requesten er opprettet, kan ikke ses fra serveren (`gh` er ikke installert). **Alle
  de andre plassholderne var ikke fylt ut** og er registrert slik:

  | Plassholder | Registrert som |
  |---|---|
  | Pull request `fase-14` → `main` | ikke oppgitt, ikke merget |
  | Kodegjennomgang (tofaktor, `householdAccess`) | ingen |
  | Teamets egen tekst (02, 03, 13, 15, 18, vurderingene i 06/14/16/17) | ingen |
  | KI-erklæringen | ikke lest, ikke signert |
  | Kapitler godkjent av teamet | ingen |
  | Kilder slått opp / lest selv | ingen |
  | Referansestil | ikke valgt (anbefalt APA 7) |
  | Offisielle krav, frist, format, sideantall, presentasjonslengde | ukjent |
  | Test på ekte telefon med skjermleser | ikke gjort |
  | Kontaktadresse, art. 9 | ikke valgt / ikke vurdert |
  | Passfrase og TOTP-nøkkel utenfor serveren | nei |
  | Kontroll av oppskrifter, `ingredients.json`, OFF-kategorier | ingen |
  | ADR-0017, pilotdataene | ikke godkjent, ikke slettet (frist 2026-11-23) |
- **Planen:** fasemalen med sju åpne spørsmål. Ferdinand svarte: «Ja men du kan vise meg passordet til meg og linus i
  chat det går fint. alt annet er godkjent vennligst fortsett og commit og psh». Det er tolket slik: kontoer til
  Ferdinand og Linus i testmiljøet, med passordene vist i chatten, sjekklisten beholdes som én fil, og commit og push
  til slutt. «Godkjent» gjelder planen, ikke gjennomgang eller godkjenning av kode eller kapitler.

**Endret**
- **Kontoer i testmiljøet:** `ferdinand@smartmat.test` og `linus@smartmat.test`, laget med `create-user` og tilfeldige
  passord (lagret i `smartmat-private/kontoer-testmiljo.txt`, 0600). Ingen e-postadresse var oppgitt, og appen sender
  ingen e-post, så adressene er bare innloggingsnavn. Innlogging gjennom Caddy er sjekket for begge (200). Bevis:
  `docs/evidence/test-results/fase-14/07-kontoer-testmiljo-del3.txt`, uten passord.
- **KI-erklæringen:** fakta oppdatert (perioden til 2026-10-29, 53 rader i KI-loggen, fase 14 og kontoene). Teamets
  avsnitt er ikke rørt.
- Sjekklisten (ett punkt krysset av, én fil), veikartet (rad 13 og 14), testmiljo.md, endringsloggen, CLAUDE.md og
  KI-loggen (#52 for 4522b36, #53 for denne økten).

**Ikke gjort**
- **Passordet til basic auth er ikke byttet.** KI anbefalte det i planen, og «alt annet er godkjent» ble først tolket
  som et ja. Verktøyets sikkerhetssperre stoppet endringen i Caddyfile før noe ble skrevet, fordi prompten sier at
  Caddyfile bare endres når teamet ber om det. Caddyfile og passordfilen er uendret (sjekket). Teamet må be om det
  uttrykkelig.

**Resultat:** Ingen endring i appen. Lenkesjekk og formatering av dokumentasjonen, se
`docs/evidence/test-results/fase-14/`.

**Neste:** Teamet går gjennom pull requesten, skriver sine deler og finner kravene til innleveringen. Pilotdataene
slettes senest 2026-11-23.

**Tillegg samme dag (etter commit 90a7dad):** Ferdinand svarte på punktene i rapporten:
- «hvilken pilodata?»: KI forklarte at det er de tre kvitteringsbildene, fasiten og måleresultatene fra fase 8 i
  `smartmat-private` (ADR-0017, kapittel 12).
- Kopi av passfrase og nøkkel: «Det haster ikke enda da dette bare er et skole prosjekt.» Ikke gjort.
- Gjennomgang: «gjennomgått i plenum og godkjent». **Registrert som Ferdinands utsagn**: hvem som var med, omfang og funn er ikke oppgitt.
  Det finnes ingen pull request på GitHub (`git ls-remote` viser ingen `refs/pull/`), og `main` er ikke merget.
- Kravene til innleveringen: «la stå til nå».
- Pilotdataene: Ferdinand ba KI om å «slett bildene til nå». De tre kvitteringsbildene og de tre utsnittene i
  `smartmat-private` er slettet. Først ble disken søkt gjennom etter flere kopier, og det fantes ingen. Fasiten og
  måleresultatene (tekst) står igjen til ADR-0017 er avgjort, senest 2026-11-23. Bildene ble også vist til
  KI-assistenten i chatten i fase 8, og den kopien kan ikke slettes herfra.

## 2026-10-30 – Ferdinands forespørsler i testmiljøet (fase 14, tillegg)

**Bakgrunn:** Ferdinand brukte testmiljøet og ba om fire endringer i én økt med KI (Claude):

1. «Tillat å registrere ny bruker»: `REGISTRATION_OPEN=true` i `.env.staging`. Byggeflagget `VITE_REGISTRATION_OPEN`
   følger nå samme variabel i `docker/staging/compose.yml`. Sjekket: registreringen svarer 400 på en tom forespørsel
   (ikke 403). Caddys passord gjelder fortsatt.
2. Kameraet åpnet seg ikke fra «Fra kvittering»: mange nettlesere overser `capture` og viser bare en filvelger. Ny
   `ReceiptCamera` med `getUserMedia` (bakkamera, høy oppløsning); kamera-appen er reserve når kameraet ikke kan
   brukes. Ikke testet på en ekte telefon av KI.
3. «Produktoppslaget svarer ikke»: meldingen kom fra strekkodeskanneren, ikke kvitteringene. Open Food Facts var av
   (tom `OFF_USER_AGENT`). Ny status `off`, og kvitterings- og kupongkoder (GS1 98/99) peker til kvitteringssiden.
   Ferdinand valgte sin e-postadresse som kontakt i `OFF_USER_AGENT`.
4. Varene fra kvitteringen og butikken Extra: linjeforslag slått på i testmiljøet (endrer ADR-0017 punkt 3 uten ny
   måling, se notatet der), matvarelinjer krysset av for matlageret, ny lesing for logoen og gjettet butikk ut fra
   husholdningens siste kjøp i samme kjedefamilie.

**Personvern:** Ferdinand la tre ekte kvitteringer i chatten. De ble kjørt gjennom koden i containere uten nettverk,
bare samlede felt ble vist, og kopiene i scratch-mappen og i containerne ble slettet. De er ikke i Git, tester,
logger eller dokumentasjon. Et kjøretest-skript ble først kjørt inne i workeren og hang ved minnegrensen (512 MB);
det ble stoppet og fjernet, og workeren var tilbake på normalt minne.

**Resultat:** `npm test` 1378/1378 og API-testene 493/493 grønne, typecheck og lint rene (kjørt 2026-10-30, ikke
lagret som bevisfil). Kjent begrensning: en skrått fotografert kvittering gir beløp på feil linje.

**Neste:** Teamet bør prøve kameraet og kvitteringene på egne telefoner og avgjøre ADR-0017.
