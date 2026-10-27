# Sjekkliste: merge til main og innlevering

> **Status: UTKAST laget av KI (Claude) i fase 14, 2026-10-27. Ikke gjennomgått av teamet.** Ingen av punktene er
> krysset av. Et punkt krysses av når det faktisk er gjort, med hvem og dato, og det samme føres i
> [utviklingsloggen](development-journal.md). Kravene til innleveringen er **antatt**. De offisielle APP2000-kravene er
> ikke lagt inn i prosjektet.

## Del 1: merge av `fase-14` til `main`

`origin/main` står på 0f7296c (fase 0 og 1). Grenene er stablet, så en pull request fra `fase-14` inneholder alle
commitene fra fase 2 til 14 (8cb938c … 1cfee6f). Teamet oppretter og godkjenner pull requesten selv (ADR-0013).

### Før pull requesten

- [ ] Hent siste versjon: `git fetch` og sjekk at `fase-14` lokalt er lik `origin/fase-14`.
- [ ] Kjør `npm run check` og `npm run test:e2e` selv, og skriv resultatet i pull requesten. Hittil er alle
      kjøringene gjort av KI (se [bevisoversikten](../evidence/bevisoversikt.md)).
- [ ] Sjekk at ingen hemmeligheter er i repoet: `.env` skal ikke være sporet (`git ls-files .env` gir ingenting), og
      søk etter `TOTP_ENCRYPTION_KEY=`, `KASSALAPP_API_KEY=` og passord i diffen.
- [ ] Sjekk at ingen ekte kvitteringer eller svarnøkler er i repoet (`npm run check:files`).

### Gjennomgangen

Gå gjennom commit for commit og skriv funnene i pull requesten, så gjennomgangen blir dokumentert. Det som er viktigst
å lese selv:

- [ ] Autorisasjon: `apps/api/src/authz/household.ts` (`householdAccess`) og `apps/api/src/authz/requireOwner.ts`.
      Ikke-medlem skal få 404, og medlem uten eierrolle skal få 403.
- [ ] Tofaktor: `apps/api/src/lib/totp.ts`, `apps/api/src/lib/secretBox.ts`, `apps/api/src/modules/twoFactor/` og
      `loginSecondStep` i `apps/api/src/modules/auth/service.ts`. Testvektorene for TOTP er skrevet fra KI-ens
      hukommelse og bør sjekkes mot RFC 6238.
- [ ] Penger og mengder som heltall (øre, g, ml, stk) og at kjøp er eneste kilde til utgifter.
- [ ] Migreringene i `prisma/migrations/`: at hver tabell med husholdningsdata har `household_id`.
- [ ] Innhold skrevet av KI og ikke kontrollert: de 27 oppskriftene, `ingredients.json` (allergener og omregninger) og
      OFF-kategoritabellen.

### Godkjenning og merge

- [ ] Funnene er rettet (eller begrunnet) og sjekket på nytt.
- [ ] Pull requesten er godkjent av en i teamet. Skriv hvem og dato i utviklingsloggen.
- [ ] Merge til `main`. Etterpå lages nye grener fra `main`, ikke fra `fase-14`.
- [ ] Veikartet: «venter på teamets gjennomgang (pull request)» oppdateres for fasene som er gjennomgått.

## Del 2: innlevering

### Krav og rammer

- [ ] De offisielle kravene til innleveringen er lagt inn i `docs/` (eller teamet har bestemt at de ikke skal inn).
- [ ] Frist: ____ · format (PDF/Word/annet): ____ · sideantall: ____ · presentasjonslengde: ____ min.
- [ ] De antatte kravene i [kapittel 20](../academic/20-innleveringsrapport.md) er sjekket mot de offisielle.

### Teamets egen tekst

- [ ] Kapittel 02 Problemstilling og målgruppe.
- [ ] Kapittel 03 Behovsanalyse, med kilder.
- [ ] Kapittel 13: den kritiske refleksjonen.
- [ ] Kapittel 15 Gruppearbeid og ansvarsfordeling.
- [ ] Kapittel 18 Refleksjon og videreutvikling.
- [ ] Vurderingene i kapittel 06, 14, 16 og 17.
- [ ] KI-erklæringen ([vedlegg](../academic/vedlegg-ki-erklaering.md)): lest, rettet, egne avsnitt skrevet og signert.

### Kontroll og godkjenning

- [ ] Hvert kapittel er lest og godkjent av teamet. Statuslinjen endres til «Godkjent av teamet (hvem, dato)».
- [ ] `Status: UTKAST` er fjernet bare der innholdet er godkjent.
- [ ] Kilder merket [KI-kunnskap] i [kildelisten](../academic/19-kildeliste.md) er slått opp eller fjernet, og egne
      kilder er lagt til.
- [ ] Referansestilen er valgt (anbefalt: APA 7, som kildelisten allerede bruker).
- [ ] Tallene i rapporten stemmer med [bevisoversikten](../evidence/bevisoversikt.md), og «Det som ikke er testet»
      står åpent i kapittel 11 og 17.

### Det som bare teamet kan gjøre

- [ ] Test på ekte telefon med skjermleser (sjekklisten i
      [tilgjengelighet.md](testing/tilgjengelighet.md#sjekkliste-for-ekte-telefon-teamet-fyller-ut)).
- [ ] Kontaktadresse i personvernerklæringen (`/personvern`) og vurdering av behandlingsgrunnlaget for allergier
      (art. 9).
- [ ] Backup-passfrasen og `TOTP_ENCRYPTION_KEY` er tatt vare på utenfor serveren.
- [ ] Kontoer i testmiljøet til demoen.
- [ ] ADR-0017 er godkjent eller avvist, og pilotdataene i `smartmat-private` er slettet, **senest 2026-11-23**.

### Sammenstilling

- [ ] `df -h /` før noe installeres. Pandoc (og en PDF-motor hvis formatet er PDF) installeres først når formatet er
      kjent.
- [ ] Mermaid-diagrammene i kapittel 07 og 08 er gjort om til bilder.
- [ ] Statusbannere og kommentarer («Teamet skriver») er tatt ut av det sammensatte dokumentet, ikke av kildefilene.
- [ ] Det ferdige dokumentet er lest gjennom av teamet (sideskift, tabeller, lenker, bilder).
- [ ] Ingen hemmeligheter, ekte kvitteringer eller personopplysninger i vedleggene.

### Presentasjon

- [ ] Disposisjonen i [presentasjon.md](../academic/presentasjon.md) er tilpasset lengden, og teamet har bestemt hvem
      som viser hva.
- [ ] Demoen er prøvd i testmiljøet med fiktive data, og det finnes en reserve (skjermbilder) hvis nettet svikter.
- [ ] Begge kan forklare arkitekturen, hvordan KI ble brukt, og hva som ikke er testet.

### Levert

- [ ] Levert (hvem, dato, hvor). Føres i utviklingsloggen.
