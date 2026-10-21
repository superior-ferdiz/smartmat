# Gruppearbeid og ansvarsfordeling

> **Status: UTKAST / MAL.** Dette kapittelet er ikke skrevet ennå. Innholdet skal bygge på det som faktisk er implementert,
> testet og besluttet, og oppdateres underveis i fasene. Offisielle APP2000-krav til rapporten er ikke verifisert.

## Hva kapittelet skal dekke

- Oppgavefordeling (godkjent av gruppen)
- hvem gjorde hva (bare dokumentert arbeid)
- samarbeidsform

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

## Kilder i prosjektet

<!-- Lenk til ADR-er, krav, testbevis og logg som kapittelet bygger på. -->
