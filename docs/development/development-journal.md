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

