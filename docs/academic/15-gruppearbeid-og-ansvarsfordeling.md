# Gruppearbeid og ansvarsfordeling

> **Status: MAL – teamet skriver.** Oppgavefordelingen og samarbeidet er teamets egen tekst. KI (Claude) har bare
> samlet det som er dokumentert i loggene (under), og i fase 14 (2026-10-27) slått sammen dette kapittelet med det tomme
> ansvarsregisteret (tidligere `15-gruppearbeid-ansvarsregister.md`) og ført loggen videre til fase 14. Ikke fyll inn
> hvem som gjorde noe uten dokumentasjon. Offisielle APP2000-krav til rapporten er ikke verifisert.

## Hva kapittelet skal dekke

- Oppgavefordeling (godkjent av gruppen)
- hvem gjorde hva (bare dokumentert arbeid)
- samarbeidsform

## Oppgavefordeling og samarbeid

<!-- Teamet skriver: hvordan dere fordelte arbeidet mellom dere, hvordan dere samarbeidet (møter, chat, gjennomgang
av pull requests), og hvordan dere delte arbeidet med KI-assistenten. Bare det som faktisk skjedde. -->

## Ansvarsregister

Fylles ut og godkjennes av Ferdinand Risan og Linus Saxe Huseby. KI-assistenten er ikke en ansvarlig person, men det
skal stå i «Bevis» når en oppgave er gjort av KI.

| Oppgave | Ansvarlig | Støtte | Status | Gjennomgått av | Bevis |
|---|---|---|---|---|---|
| | | | | | |

## Det som er dokumentert så langt

Dette er bare fakta fra loggene, ikke kapittelets endelige tekst:

- **Fase 0–2 (2026-10-19 og 2026-10-20):** All kode og dokumentasjon er skrevet av KI-verktøyet (Claude Code).
  Ferdinand Risan har gitt promptene, tatt beslutningene og godkjent planene i chat. Linus Saxe Huseby har ikke vært
  med i øktene.
- **Arbeidsfordelingen** er ikke avtalt. I fase 2 gjelder planens forslag: KI implementerer, og teamet gjennomgår
  via pull request.
- **Arbeidsflyt med Git:** én gren per fase. Teamet oppretter og godkjenner pull requesten selv (ADR-0013).
- **Fase 3 (2026-10-21):** All kode er skrevet av KI. Ferdinand godkjente planen («godkjent») og ba om å starte
  fase 3 i samme chat som fase 2.
- **Fase 4 (2026-10-21):** All kode er skrevet av KI. Ferdinand godkjente planen og skrev samtidig: «Godkjennt du
  kan committe jeg har gått igjennom alt.» Han oppga ikke hva «alt» omfatter (planen for fase 4 eller koden i fase
  1–3), hvordan gjennomgangen ble gjort, eller om Linus var med. Dette er derfor registrert som Ferdinands egen
  erklæring, ikke som en dokumentert kodegjennomgang med funn.
- Arbeidsfordelingen i fase 4 ble satt i prompten: KI implementerer, teamet gjennomgår via pull request. Planen
  skilte mellom KI-ens del (spesifikasjon, kode, tester, dokumentasjon) og teamets del (beslutninger, gjennomgang
  av pull requesten, manuell test på telefon og med skjermleser, egne refleksjoner i dette kapittelet).
- **Fase 5 (2026-10-21):** All kode er skrevet av KI. Ferdinand godkjente planen med «godkjennt vennligst fortsett».
  Linjen i prompten om hva som er gjennomgått av fase 1–4 var ikke fylt ut, så ingen gjennomgang er registrert.
- **Oppskriftene (ADR-0009):** Teamet skal skrive dem selv. KI har ikke skrevet noen oppskrift med `source=team`.
  KI har laget et utkast til ingredienslisten med aliaser, allergener og omregninger (merket i filen), og tre
  fiktive testoppskrifter som bare finnes i test-databasene. Hvem som skriver oppskriftene, er ikke avtalt.
- **Gjennomgang av fase 5:** Ferdinand skrev 2026-10-21: «Vi har gått igjennom det i plenum.» Det er registrert som
  hans erklæring. Deltakere, omfang og eventuelle funn er ikke oppgitt.
- **Gjennomgang før fase 6:** Claude spurte hvem som deltok i gjennomgangen og hva den omfattet. Ferdinand svarte
  2026-10-21: «Begge har gjennomgått.» Det er registrert som Ferdinands erklæring om at både han og Linus Saxe
  Huseby har gått gjennom. Hva gjennomgangen omfattet (fase 5 alene eller også fase 1–4, plan, kode eller kjørende
  app), og eventuelle funn, er ikke oppgitt. Linus har ikke selv bekreftet det i en økt.
- **Fase 6 (2026-10-21):** All kode er skrevet av KI. Ferdinand godkjente planen («Jeg godkjenner plannen») og ba om
  commit og push av `fase-5`. Arbeidsfordelingen var som i fase 4–5: KI implementerer, teamet gjennomgår via pull
  request og prøver listen på en ekte telefon i butikk.

- **Fase 7 (2026-10-21/22):** All kode er skrevet av KI. Ferdinand godkjente planen 2026-10-22 og svarte på tre av
  spørsmålene (behandlingsansvarlig, domene, serverens land og drift).
- **Fase 8 (2026-10-24):** All kode er skrevet av KI. Ferdinand godkjente med «Vi godkjenner alt i plenum» og oppga at
  fase 7 er «gjennomgått i plenum av både meg og Linus». Ferdinand kontrollerte fasiten til OCR-piloten mot
  papirkvitteringene («Kontrollert og all good»). Kvitteringene er teamets egne.
- **Fase 9 (2026-10-24):** All kode er skrevet av KI. Ferdinand tok beslutningen om at oppskrifter skal «hentes fra
  internett» og godkjente planen: «Godkjent i plenum av Ferdinand og Linus».
- **Fase 10–12 (2026-10-24/25):** All kode er skrevet av KI. Ferdinand godkjente planene («godkjennt», «Godkjent commit og
  push», «Godkjennt») uten å svare på spørsmålene enkeltvis. Ingen gjennomgang er oppgitt.
- **Fase 13 (2026-10-25/27):** All kode er skrevet av KI. Ferdinand godkjente planen («Godkjennt i plenum, vennligst
  fortsett!»), sa fra at DNS var klart, og kjørte selv en kommando for passordet til basic auth (som feilet på grunn
  av KI-ens instruks, se utviklingsloggen).
- **Fase 14 (2026-10-27):** Ferdinand godkjente planen («godkjennt og fortsett») uten å fylle ut plassholderne i
  prompten. KI lager utkast, teamet skriver kapittel 02, 03, refleksjonen i 13, 15 og 18.
- **Linus Saxe Huseby** har ikke vært med i noen økt med KI-assistenten, og har ikke selv bekreftet noen gjennomgang i
  en økt. Alt som står om ham over, er Ferdinands erklæringer.

## Kilder i prosjektet

<!-- Lenk til ADR-er, krav, testbevis og logg som kapittelet bygger på. -->
