# ADR-0009: Egne norske frøoppskrifter i stedet for eksternt oppskrifts-API

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå. **2026-10-22:** [ADR-0016](0016-oppskrifter-fra-apne-kilder.md) er foreslått som erstatning (teamet skriver ikke oppskrifter selv), men er ikke godkjent. Til den er godkjent gjelder denne.

## Kontekst
TheMealDB er engelskspråklig med blandede enheter, og vilkårene for gratisnøkkelen er etter vår forståelse rettet mot utvikling/utdanning (ikke verifisert).
Kopiering av oppskriftssamlinger kan bryte opphavsretten.

## Beslutning
Teamet skriver 30–50 norske oppskrifter med strukturerte ingredienser i grunnenheter, merket `source=team`, `license=egen`.
Oppskriftskilder ligger bak et provider-grensesnitt, så eksterne kilder kan legges til senere.

## Konsekvenser
Rene data for matching og ingen lisensrisiko. Begrenset utvalg i starten. Hvem som skriver oppskriftene, må registreres reelt.
