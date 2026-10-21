# Veikart

Hver fase gjennomføres i en egen chat. Se [CLAUDE.md](../../CLAUDE.md) for arbeidsflyten og
[fase-oppstart.md](fase-oppstart.md) for teksten som limes inn for å starte en ny fase.

Status: `Ikke startet` · `Pågår` · `Ferdig` (= oppfyller Definition of Done nederst) · `Utsatt`

| Fase | Innhold | Omfang | Status |
|---|---|---|---|
| 0 | Planlegging: beslutninger (ADR), krav, datamodell, dokumentasjonsstruktur | — | Ferdig (2026-10-19) |
| 1 | Designsystem og app-skall: monorepo, Vite/React, tokens, layout, navigasjon, i18n, skjema-komponenter, tilstander for lasting/feil/tom | MVP | Pågår – implementert og testet 2026-10-20, venter på teamets gjennomgang (eneste punkt i DoD som mangler) |
| 2 | Database og autentisering: Docker/Postgres, Prisma, registrering, innlogging, sesjoner, profil, husholdning-av-én, autorisasjon | MVP | Pågår – implementert og testet 2026-10-20 på grenen `fase-2`, venter på teamets gjennomgang (pull request) |
| 3 | Matlager: produkter, partier (batches), lagringssteder, søk/filter/sortering, holdbarhet, forbruk og kassering med svinnlogg | MVP | Ikke startet |
| — | **Milepæl: første reelt brukbare versjon** | | |
| 4 | Budsjett: manuelle kjøp, kategorier, månedsbudsjett, oversikt, kobling kjøp → lager | MVP | Ikke startet |
| 5 | Oppskrifter: datamodell, egne frøoppskrifter, ingrediensmatching, forklart poengsum, manglende ingredienser | Første innlevering | Ikke startet |
| 6 | Handleliste (flyttet frem fra fase 9): manuell, fra oppskrift, kjøpt → lager | Første innlevering | Ikke startet |
| 7 | Strekkodeskanning: kamera, Open Food Facts, manuell reserve, bekreftelse | Første innlevering | Ikke startet |
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
