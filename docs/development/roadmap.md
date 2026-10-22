# Veikart

Hver fase gjennomføres i en egen chat. Se [CLAUDE.md](../../CLAUDE.md) for arbeidsflyten og
[fase-oppstart.md](fase-oppstart.md) for teksten som limes inn for å starte en ny fase.

Status: `Ikke startet` · `Pågår` · `Ferdig` (= oppfyller Definition of Done nederst) · `Utsatt`

| Fase | Innhold | Omfang | Status |
|---|---|---|---|
| 0 | Planlegging: beslutninger (ADR), krav, datamodell, dokumentasjonsstruktur | — | Ferdig (2026-10-19) |
| 1 | Designsystem og app-skall: monorepo, Vite/React, tokens, layout, navigasjon, i18n, skjema-komponenter, tilstander for lasting/feil/tom | MVP | Pågår – implementert og testet 2026-10-20, venter på teamets gjennomgang (eneste punkt i DoD som mangler) |
| 2 | Database og autentisering: Docker/Postgres, Prisma, registrering, innlogging, sesjoner, profil, husholdning-av-én, autorisasjon | MVP | Pågår – implementert og testet 2026-10-20 på grenen `fase-2`, venter på teamets gjennomgang (pull request) |
| 3 | Matlager: produkter, partier (batches), lagringssteder, søk/filter/sortering, holdbarhet, forbruk og kassering med svinnlogg | MVP | Pågår – implementert og testet 2026-10-21 på grenen `fase-3` (fra `fase-2`, commit 856e68b, pushet 2026-10-21), venter på teamets gjennomgang. Produktkatalogen er flyttet til fase 7. |
| — | **Milepæl: første reelt brukbare versjon** – teknisk nådd med fase 3 (2026-10-21), men ikke gjennomgått eller testet av teamet | | |
| 4 | Budsjett: manuelle kjøp, kategorier, månedsbudsjett, oversikt, kobling kjøp → lager | MVP | Pågår – implementert og testet 2026-10-21 på grenen `fase-4` (fra `fase-3`, pushet 2026-10-21), venter på teamets gjennomgang (pull request) |
| 5 | Oppskrifter: datamodell, egne frøoppskrifter, ingrediensmatching, forklart poengsum, manglende ingredienser, allergener | Første innlevering | Pågår – implementert og testet 2026-10-21 på grenen `fase-5` (fra `fase-4`), ikke committet. **Teamets oppskrifter mangler** (ADR-0009), og KI-utkastet til ingredienslisten (allergener, omregninger) er ikke kontrollert. Ferdinand oppga 2026-10-21 at teamet har gått gjennom fasen «i plenum», og senere samme dag «Begge har gjennomgått» (omfang ikke spesifisert). Committet (3197771) og pushet 2026-10-21. |
| 6 | Handleliste (flyttet frem fra fase 9): manuell, fra oppskrift, kjøpt → lager | Første innlevering | Pågår – implementert og testet 2026-10-21 på grenen `fase-6` (fra `fase-5`), ikke committet. Venter på teamets gjennomgang (pull request) og test på ekte telefon i butikk. |
| 7 | Strekkodeskanning: kamera, Open Food Facts, manuell reserve, bekreftelse | Første innlevering | Pågår – implementert og testet 2026-10-22 på grenen `fase-7` (fra `fase-6`), ikke committet. Testmiljøet (ADR-0015) er bygd, men ikke satt opp (DNS mangler). Venter på teamets gjennomgang (pull request), test på ekte telefon og kontaktadresse for Open Food Facts. ADR-0016 (oppskrifter) er bare foreslått. |
| — | **Anbefalt linje for første innlevering** | | |
| 8 | Kvitterings-OCR: måling (spike) på ekte kvitteringer → valg av løsning → parser, gjennomgang, bekreftelse | Valgfritt / eksperimentelt | Ikke startet |
| 9 | Måltidsplan: ukeplan, porsjoner, behov → handleliste | Valgfritt | Ikke startet |
| 10 | Husholdning: invitasjoner, roller, deling (datamodellen finnes fra fase 2) | Senere | Ikke startet |
| 11 | Svinnstatistikk og varsler i appen | Senere | Ikke startet |
| 12 | Prisdata (etter vilkårsavklaring, ADR-0010) | Senere | Ikke startet |
| 13 | Sikkerhet, ytelse, tilgjengelighet, backup, hosting | Senere | Ikke startet |
| 14 | Akademisk ferdigstilling: rapport, bevis, KI-erklæring, presentasjon | Avslutning | Ikke startet |

Rekkefølgen er endret fra den opprinnelige prompten: handleliste er flyttet foran strekkode og OCR fordi den
er billig, bruker oppskriftene direkte og gir mer verdi tidlig. Pris er flyttet sent fordi tilgangen er uavklart.

## Definition of Done

En funksjon er ferdig først når: kravene er dokumentert, koden er implementert, bygg og typesjekk går grønt,
relevante tester er kjørt og bestått (med lagret utdata), autorisasjon og validering er verifisert på serveren,
feil- og tomtilstander fungerer, mobilvisning er sjekket, dokumentasjonen er oppdatert, og studentenes
gjennomgang er registrert. Det som ikke er oppfylt, rapporteres åpent.
