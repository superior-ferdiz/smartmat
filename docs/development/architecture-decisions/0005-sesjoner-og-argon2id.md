# ADR-0005: Serverlagrede sesjoner og argon2id

**Status:** Akseptert 2026-10-19 — foreslått av KI (Claude), godkjent overordnet av Ferdinand Risan i chat. Ikke gjennomgått i detalj av Linus Saxe Huseby ennå.

## Kontekst
Appen behandler kjøpsvaner og økonomi. Innlogging må være sikker og kunne trekkes tilbake.

## Beslutning
- Passord hashes med argon2id. Klartekst lagres aldri.
- Sesjoner lagres i Postgres. Nettleseren får bare en tilfeldig sesjons-ID i en cookie med `HttpOnly`, `Secure`, `SameSite=Lax`.
  Databasen lagrer en hash av ID-en.
- Endrende forespørsler sjekker `Origin` og et CSRF-token.
- Rate limiting på innlogging, registrering og tilbakestilling av passord.

## Alternativer
- JWT i localStorage: kan stjeles ved XSS og kan ikke trekkes tilbake før utløp.
- Ekstern innloggingstjeneste (Auth0, Clerk): mindre å bygge, men personopplysninger til tredjepart og mindre læring.

## Konsekvenser
Utlogging og sletting av konto virker umiddelbart. Krever et databaseoppslag per forespørsel (akseptabelt).
