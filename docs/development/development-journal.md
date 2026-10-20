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

