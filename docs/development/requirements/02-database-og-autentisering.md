# 02 – Database og autentisering (fase 2)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-20 («Godkjent vennligst begynn og gjør fase 2»).
Spesifikasjonen er skrevet av KI (Claude) i samme økt som implementeringen. Den ble ikke skrevet ferdig før koden, slik
CLAUDE.md beskriver, men samtidig med den. Ikke gjennomgått av Linus Saxe Huseby.

**Bygger på:** FR-AUTH-001–005, NFR-SEC-001–004 i [00-kravoversikt.md](00-kravoversikt.md),
ADR-0002, ADR-0003, ADR-0005, ADR-0008, ADR-0012, ADR-0013.

## Avgjørelser tatt ved godkjenningen

Planen hadde sju åpne spørsmål. Godkjenningen svarte ikke på dem enkeltvis, så forslagene i planen gjelder:

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1a | Er fase 1 gjennomgått? | Ikke besvart. Registreres som **ikke gjennomgått**. |
| 1b | Arbeidsfordeling | Ikke besvart. Forslaget gjelder: **KI implementerer, teamet gjennomgår via pull request.** |
| 2 | Er `/designsystem` offentlig? | Ja. Den viser ingen brukerdata. |
| 3 | Registrering med en e-post som allerede finnes | Vi gir en ærlig melding. Rate limiting begrenser misbruk. |
| 4 | Minste passordlengde | 12 tegn (NIST anbefaler 15 når passord er eneste faktor) |
| 5 | AuditEvent | Utsatt til fase 3 |
| 6 | Prisma-versjon | 7.10.1 (siste stabile). `prisma@latest` pekte på en release-kandidat for 8.0. |
| 7 | Rate limit lokalt | Grensen per IP-adresse gjelder i praksis alle samtidig lokalt. Sperren per konto er hovedforsvaret. |

## Krav og akseptansekriterier

### FR-AUTH-001 Registrering
- Brukeren oppgir navn (1–50 tegn), e-postadresse og passord (12–128 tegn). Språket tas fra språkvalget i grensesnittet.
- E-postadressen lagres uten mellomrom i endene og med små bokstaver. `Kari@X.no` og `kari@x.no` er samme konto.
- En e-postadresse som allerede finnes, gir 409 med en melding ved e-postfeltet.
- Ved registrering opprettes brukeren, en husholdning og et medlemskap med rollen `owner` i **én transaksjon**.
- Brukeren er innlogget etter registrering.

### FR-AUTH-002 Innlogging og utlogging
- Feil passord, ukjent e-post og sperret konto gir **samme svar** (401 `errors.auth.invalidCredentials`).
  Det gjøres like mye hasharbeid i alle tre tilfeller, så svartiden avslører heller ikke hvilket tilfelle det er.
- Innlogging gir alltid en ny sesjons-ID. En sesjon nettleseren hadde fra før, avsluttes.
- Utlogging sletter sesjonen i databasen og fjerner cookien. Med en gyldig sesjon krever utlogging CSRF-token.
- **Sesjonen utløper** etter 14 dager uten bruk, og senest 30 dager etter innlogging.
- Sider med brukerdata krever innlogging. En uinnlogget bruker sendes til `/logg-inn?neste=<side>` og tilbake
  etterpå. `neste` godtas bare som en sti i appen (ingen åpen viderekobling).

### FR-AUTH-003 Begrensning av innloggingsforsøk
- **Per konto:** etter 5 feil passord på rad sperres kontoen i 15 minutter. Under sperren avvises også riktig
  passord, med det samme generelle svaret. En vellykket innlogging nullstiller telleren.
- **Per IP-adresse:**

  | Endepunkt | Grense |
  |---|---|
  | Innlogging | 20 forsøk per 15 min |
  | Registrering | 10 per time |
  | Passordbytte og kontosletting | 10 per 15 min |

  Over grensen svarer API-et 429 `errors.rateLimited` med `Retry-After`.
- `X-Forwarded-For` blir ikke trodd. Ellers kunne en angriper få en ny grense for hver forespørsel.

### FR-AUTH-004 Profil
- Brukeren kan endre navn og språk. Språket lagres på kontoen og gjelder også på andre enheter.
- **Passordbytte** krever nåværende passord. Feil passord gir 400 ved feltet. Etter byttet logges alle *andre*
  sesjoner ut, mens denne sesjonen beholdes.
- E-postadressen kan ikke endres i denne fasen, fordi det krever e-postverifisering (FR-AUTH-006).

### FR-AUTH-005 Sletting av konto
- Krever passord og en avkrysning for «Jeg forstår at alt slettes».
- Sletter i én transaksjon: brukeren, sesjonene, medlemskapene og **husholdninger der brukeren er eneste medlem**,
  med alt som hører til dem (`ON DELETE CASCADE`). En husholdning som deles med andre, beholdes; da fjernes bare
  medlemskapet. Overføring av eierskap kommer i fase 10.
- Etter sletting virker ingen av de gamle cookiene, innlogging feiler, og e-postadressen kan registreres på nytt.

### FR-AUTH-007 Husholdning av én (ADR-0008)
- Hver bruker har nøyaktig én husholdning etter registrering, med seg selv som `owner`.
- Den innloggede brukeren får `householdId` fra API-et (`GET /auth/session`).

## Sikkerhetskrav

### NFR-SEC-001 Autorisasjon på serveren
- Alle ruter for husholdningsdata bruker `requireAuth` og `householdAccess`
  (`apps/api/src/authz/household.ts`). Husholdnings-ID-en kommer fra URL-en og sjekkes mot medlemskap i databasen
  før ruten kjører.
- Er brukeren ikke medlem, svarer API-et **404**, likt som for en husholdning som ikke finnes.
- Profilruter bruker `/me`. Bruker-ID-en tas alltid fra sesjonen, aldri fra forespørselen.

### NFR-SEC-002 Validering
- Alle forespørsler valideres med de delte Zod-skjemaene i `packages/shared` før rutekoden kjører.
- Felt som ikke er i skjemaet, fjernes.

### NFR-SEC-003 Passord og cookie
- **Passord:** argon2id med m = 19 MiB, t = 2, p = 1. Passord i klartekst lagres eller logges aldri.
- **Cookie:** `smartmat_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Den varer til den absolutte
  grensen på 30 dager; serveren håndhever grensen for inaktivitet.
- **Sesjonstoken:** 256 tilfeldige bit. Databasen lagrer bare SHA-256 av tokenet.

### NFR-SEC-004 Ingen personopplysninger i logger eller feilmeldinger
- Feilsvar har formen `{ error: { code, fields? } }`. Kodene er i18n-nøkler; svarene har ingen stack, SQL eller
  inndata.
- Loggen inneholder metode, URL, statuskode og tid. Den inneholder ikke IP-adresse, e-post, navn, passord, cookie
  eller CSRF-token.
- Uventede feil logges uten feilmeldingens tekst, fordi den kan inneholde inndata.

### NFR-SEC-005 CSRF (nytt)
- Alle endrende forespørsler (POST/PATCH/DELETE) må ha `Origin` fra tillatelseslisten (`APP_ORIGINS`). Hvis den
  mangler eller er fremmed, svarer API-et 403.
- Når brukeren er innlogget, kreves i tillegg `X-CSRF-Token`. Den må være lik tokenet som er lagret med sesjonen, og
  sammenlignes i konstant tid.
- Registrering og innlogging har ingen sesjon og er beskyttet av Origin og `SameSite=Lax`.

## API (fase 2)

Se [api-documentation.md](../api-documentation.md) for detaljer.

| Metode | Sti | Krever |
|---|---|---|
| POST | `/api/v1/auth/register` | Origin, rate limit |
| POST | `/api/v1/auth/login` | Origin, rate limit, sperre per konto |
| POST | `/api/v1/auth/logout` | Origin (+ CSRF ved gyldig sesjon) |
| GET | `/api/v1/auth/session` | sesjon |
| GET / PATCH | `/api/v1/me` | sesjon (+ Origin og CSRF ved PATCH) |
| POST | `/api/v1/me/password` | sesjon, Origin, CSRF, rate limit |
| DELETE | `/api/v1/me` | sesjon, Origin, CSRF, rate limit |
| GET | `/api/v1/households/:householdId` | sesjon og medlemskap |
| GET | `/api/v1/health` | – |

## Lokalt oppsett

| Tjeneste | Adresse |
|---|---|
| Postgres 16 | `127.0.0.1:55432`, containeren `smartmat-postgres`. Databasene `smartmat`, `smartmat_test` og `smartmat_e2e` |
| API | `127.0.0.1:3100` (Playwright bruker sin egen instans på 3101) |
| Web (Vite) | `127.0.0.1:5173`. Videresender `/api` til API-et |

Hemmeligheter ligger i `.env`, som ikke er i Git. [`.env.example`](../../../.env.example) viser hvilke variabler som
trengs.

## Utenfor fasen
Tilbakestilling av passord og e-postverifisering (FR-AUTH-006, krever e-posttjeneste), endring av e-postadresse,
invitasjoner og deling av husholdning (fase 10), AuditEvent (fase 3), oppsett bak omvendt proxy og HTTPS (fase 13).

## Sporbarhet til tester

Se tabellen i [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-2).

## Til gjennomgang for teamet

Alt i fasen er skrevet av KI. Før fasen regnes som ferdig, bør Ferdinand og Linus gjøre dette:

1. Kjør `npm install`, `npm run db:up`, `npm run db:migrate` og `npm run dev`. Registrer en bruker, logg ut og inn,
   endre profilen og slett kontoen.
2. **Brute force:** Prøv å logge inn med feil passord seks ganger, og deretter med riktig. Hva ser dere?
3. **Kode:** Les `apps/api/src/modules/auth/service.ts` (forretningsreglene) og `apps/api/src/authz/household.ts`
   (autorisasjonsmønsteret). Kan dere forklare hvorfor svaret er 404 og ikke 403?
4. **Sikkerhetstester:** Les `apps/api/test/security.api.test.ts`. Mangler det noe dere ville testet?
5. **Datamodell:** Se på `prisma/schema.prisma` og migreringen. Stemmer den med datamodellen i
   `docs/development/data-model.md`?
6. **Beslutninger:** Ta stilling til avgjørelsene i tabellen øverst, særlig passordlengde og ærlig melding ved
   e-post som finnes.
7. **Pull request:** Opprett den på GitHub fra grenen `fase-2` når dere vil gjennomgå.

Registrer gjennomgangen i utviklingsloggen og KI-loggen (hvem, dato, hva dere så på, endringer).
