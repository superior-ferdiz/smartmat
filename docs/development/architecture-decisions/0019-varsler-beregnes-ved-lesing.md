# ADR-0019: Varsler i appen beregnes ved lesing, og bare brukerens tilstand lagres

**Status:** Akseptert 2026-10-25. Foreslått av KI (Claude) i planen for fase 11, og godkjent av Ferdinand Risan i chat
(«Godkjent commit og push»). Ikke gjennomgått av Linus Saxe Huseby. Se
[spesifikasjon 11](../requirements/11-svinn-og-varsler.md).

## Kontekst
Fase 11 skal gi varsler i appen: datoer som nærmer seg, budsjettet og handlelisten. Det finnes ingen e-post eller push
(FR-AUTH-006 er utsatt). Dataene varslene bygger på, endrer seg hele tiden: et parti blir brukt opp, kastet, flyttet
eller slettet, en dato rettes, et kjøp slettes, og et medlem forlater husholdningen. Samme varsel skal ikke komme
flere ganger, og ingen skal få varsler fra en husholdning de har forlatt.

## Beslutning
- Varslene **regnes ut ved hver lesing** fra matlageret, budsjettet og handlelisten, med rene funksjoner i
  `packages/shared/src/notifications/rules.ts`. Det samme prinsippet som for budsjettet (ADR-0007).
- Hvert varsel har en **fast nøkkel** bygd av det det gjelder og trinnet: `useBy:today:<parti>:<dato>`,
  `budget:2026-10:80`. En ny dato eller en ny måned gir en ny nøkkel.
- Bare **brukerens tilstand** lagres: `notification_states (user_id, household_id, key, seen_at, dismissed_at)`, med
  nøkkelen som en del av primærnøkkelen. Tabellen har ikke noe innhold fra varselet.
- Tilstanden har en fremmednøkkel til medlemskapet med `ON DELETE CASCADE`.
- Serveren godtar bare nøkler som er aktive nå for husholdningen og brukeren.

## Alternativer
- **pg-boss-jobb som lager og lagrer varsler (for eksempel hver natt):**
  - Fordeler: varselhistorikk og tidspunkt for når varselet kom, og det er dette som trengs for e-post eller push.
  - Ulemper: et lagret varsel blir gammelt med en gang dataene endrer seg. Jobben må rydde når et parti brukes opp,
    en dato rettes eller et medlem går ut. Ellers kommer varsler om ting som ikke finnes, doble varsler og varsler
    fra en husholdning man har forlatt. Det lagrer kopier av varenavn, og appen trenger workeren for å virke lokalt.
  - Forkastet for nå.
- **Bare i nettleseren (localStorage for avviste varsler):** ingen tabell, men avvisningen følger ikke brukeren til
  en annen enhet og kan ikke testes mot databasen. Forkastet.

## Konsekvenser
- Varslene stemmer alltid med dataene, og en utmelding fjerner både varslene og tilstanden med en gang.
- Hver lesing koster noen få spørringer med indeks (partier med dato, budsjettet, handlelisten). Det er billig for én
  husholdning.
- Det finnes ingen historikk over varsler. Når e-post eller push kommer (fase 13), trengs en jobb som sender, og den
  kan bruke de samme reglene og nøklene for å hindre doble utsendelser.
