# API-dokumentasjon

**Status:** Fase 2 (2026-10-20). Skrevet av KI (Claude), ikke gjennomgått av teamet. Se
[ADR-0002](architecture-decisions/0002-fastify-rest-api.md) og
[fasespesifikasjon 02](requirements/02-database-og-autentisering.md).

Alle endepunkter ligger under `/api/v1`. Forespørsler og svar er JSON. Skjemaene ligger i `packages/shared`
(`src/schemas/` for inn, `src/api/` for ut) og brukes av både API-et og web-appen.

## Felles regler

| Regel | Detaljer |
|---|---|
| Innlogging | Cookien `smartmat_session` (HttpOnly, Secure, SameSite=Lax). Nettleseren sender den automatisk. |
| Origin | POST, PATCH og DELETE må ha `Origin` fra `APP_ORIGINS`, ellers 403 `errors.security.forbiddenOrigin` |
| CSRF | POST, PATCH og DELETE med sesjon må ha `X-CSRF-Token` lik `csrfToken` fra `/auth/session`, ellers 403 `errors.security.invalidCsrf` |
| Validering | Ugyldig input gir 400 `errors.validation` med `fields`, der hver verdi er en i18n-nøkkel. Ukjente felt fjernes. |
| Feilformat | `{ "error": { "code": "<i18n-nøkkel>", "fields"?: { "<felt>": "<i18n-nøkkel>" } } }` |
| Ikke innlogget | 401 `errors.auth.unauthenticated` |
| Rate limit | 429 `errors.rateLimited` med `Retry-After` |
| Ukjent rute eller ingen tilgang | 404 `errors.notFound` |
| Uventet feil | 500 `errors.internal`, uten detaljer |

## Typer

```ts
SessionUser = { id: uuid, email: string, displayName: string, locale: 'nb-NO' | 'en', householdId: uuid }
SessionResponse = { user: SessionUser, csrfToken: string }
HouseholdResponse = { id: uuid, name: string, role: 'owner' | 'member', memberCount: number }
```

## Endepunkter

### `POST /auth/register` (FR-AUTH-001)
- **Kropp:** `{ displayName, email, password, locale? }`. Navnet er 1–50 tegn, passordet 12–128 tegn.
- **Svar:** `201 SessionResponse` og `Set-Cookie`. Brukeren, husholdningen og eiermedlemskapet opprettes i én
  transaksjon.
- **Feil:** 400 validering, 409 `errors.auth.emailTaken` (også i `fields.email`), 429.
- **Rate limit:** 10 per time per IP.

### `POST /auth/login` (FR-AUTH-002/003)
- **Kropp:** `{ email, password }`
- **Svar:** `200 SessionResponse` og `Set-Cookie`. Alltid ny sesjon. En eventuell gammel sesjon i samme nettleser
  slettes.
- **Feil:** 401 `errors.auth.invalidCredentials`. Gjelder både ukjent e-post, feil passord og sperret konto
  (5 feil gir 15 minutters sperre). 429.
- **Rate limit:** 20 per 15 min per IP.

### `POST /auth/logout`
- **Svar:** `204` og fjernet cookie. Med gyldig sesjon kreves CSRF-token. Uten sesjon svarer API-et likevel 204.

### `GET /auth/session`
- **Svar:** `200 SessionResponse`, eller 401 hvis ingen er innlogget.

### `GET /me` · `PATCH /me` (FR-AUTH-004)
- **GET:** `200 SessionUser`
- **PATCH kropp:** `{ displayName?, locale? }`, minst ett av feltene. Svaret er `200 SessionUser`.

### `POST /me/password` (FR-AUTH-004)
- **Kropp:** `{ currentPassword, newPassword }`
- **Svar:** `204`. Alle *andre* sesjoner for brukeren slettes.
- **Feil:** 400 `errors.auth.wrongPassword` (i `fields.currentPassword`), 429.
- **Rate limit:** 10 per 15 min per IP.

### `DELETE /me` (FR-AUTH-005)
- **Kropp:** `{ password }`
- **Svar:** `204` og fjernet cookie. Sletter brukeren, sesjonene, medlemskapene og husholdninger der brukeren er
  eneste medlem.
- **Feil:** 400 `errors.auth.wrongPassword` (i `fields.password`), 429.
- **Rate limit:** 10 per 15 min per IP.

### `GET /households/:householdId` (NFR-SEC-001)
- **Krever:** innlogging og medlemskap i husholdningen.
- **Svar:** `200 HouseholdResponse`. Er brukeren ikke medlem, eller finnes husholdningen ikke, svarer API-et `404`
  i begge tilfeller.

### `GET /health`
- **Svar:** `200 { "status": "ok" }` når databasen svarer.
