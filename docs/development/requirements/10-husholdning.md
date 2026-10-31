# 10 – Husholdning: invitasjoner, roller og deling (fase 10)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-24 («godkjennt»). De sju åpne spørsmålene ble ikke
besvart enkeltvis, så anbefalingene i planen gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før
implementeringen. Ikke gjennomgått av Linus Saxe Huseby.

**Bygger på:** NFR-SEC-001/002/004/005, FR-AUTH-005 og FR-REC-004 i [00-kravoversikt.md](00-kravoversikt.md),
ADR-0005, ADR-0008 og [ADR-0018](../architecture-decisions/0018-delte-husholdninger-og-invitasjoner.md).

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Én eller flere husholdninger per bruker | Flere, høyst 5. Den aktive lagres på brukeren (`users.active_household_id`). |
| 2 | Hvor lenge en invitasjon varer | 48 timer |
| 3 | Én eier eller flere | Nøyaktig én eier per husholdning, med overføring |
| 4 | Sletting av konto når man eier en delt husholdning | Eierskapet går automatisk til medlemmet som har vært med lengst. Det står i slettedialogen. |
| 5 | Allergier i husholdningen | Frivillig deling per husholdning, av som standard, uten navn |
| 6 | Kan medlemmer endre budsjettet | Ja, det er husholdningsdata |
| 7 | Plassholderne i prompten | Gjennomgang siden fase 9: ingen. Kontroll av oppskriftene: ingen ennå. ADR-0017: ikke godkjent ennå. |

## Begreper

| Begrep | Betydning |
|---|---|
| **Eier** (`owner`) | Ett medlem per husholdning. Kan invitere, fjerne, gi nytt navn, overføre og slette. |
| **Medlem** (`member`) | Kan lese og endre alle husholdningsdata, se medlemslisten og forlate husholdningen |
| **Aktiv husholdning** | Den husholdningen sidene viser. `session.user.householdId` i API-et. |
| **Invitasjon** | En engangslenke `…/bli-med#<token>`. Bare SHA-256 av tokenet lagres. |
| **Tidligere medlem** | En bruker som har laget noe i husholdningen, men ikke er medlem lenger |

## Krav og akseptansekriterier

### FR-HH-001 Invitasjon
- Bare eieren kan lage invitasjoner. Et medlem får 403 (`errors.household.ownerOnly`).
- Tokenet er 32 tilfeldige byte (256 bit) i base64url, altså 43 tegn. Databasen lagrer bare SHA-256 av det
  (`token_hash`, unik).
- Tokenet vises **én gang**, i svaret på `POST`. Det kan ikke hentes igjen. Lenken bygges i nettleseren:
  `<origin>/bli-med#<token>`. Tokenet står i fragmentet, så nettleseren sender det ikke til serveren når siden
  åpnes, og det kommer ikke i logger eller `Referer`.
- Invitasjonen utløper etter **48 timer** (`expires_at`).
- Høyst **5 aktive** invitasjoner per husholdning (409 `errors.household.tooManyInvitations`).
- Eieren ser invitasjonene fra de siste 30 dagene med status (aktiv, brukt av ‹navn›, trukket tilbake, utløpt) og kan
  trekke tilbake en aktiv. Det er ufarlig å trekke tilbake en invitasjon som ikke lenger er aktiv (204).
- Deling: «Del lenken» bruker telefonens delingsmeny (`navigator.share`) når den finnes, ellers «Kopier lenken».
  Lenken står også i et felt som kan merkes.

### FR-HH-002 Bli med
- Siden `/bli-med` leser tokenet fra fragmentet og fjerner det fra adresselinjen med en gang.
  - **Ikke innlogget:** tokenet lagres i `sessionStorage` (bare denne fanen), og siden lenker til innlogging og
    registrering med `neste=/bli-med`.
- `POST /invitations/preview` viser:
  - navnet på husholdningen
  - hvem som inviterte (visningsnavn)
  - antall medlemmer
  - når invitasjonen utløper
  - om brukeren allerede er medlem

  Den bruker ikke opp invitasjonen.
- `POST /invitations/accept` gjør dette i **én transaksjon**:
  1. låser brukerraden og husholdningsraden
  2. merker invitasjonen som brukt med en betingelse (`used_at IS NULL AND revoked_at IS NULL AND expires_at > nå`)
  3. sjekker grensene
  4. lager medlemskapet (`member`)
  5. gjør husholdningen aktiv

  Blir ingen rad endret, er svaret `errors.household.invitationInvalid`.
- **Samme svar** (404 `errors.household.invitationInvalid`) for ukjent, utløpt, brukt og tilbaketrukket invitasjon.
- Allerede medlem: 409 `errors.household.alreadyMember`, og invitasjonen blir **ikke** brukt opp.
- Grenser:

  | Grense | Feil |
  |---|---|
  | 10 medlemmer per husholdning | 409 `errors.household.full` |
  | 5 husholdninger per bruker | 409 `errors.household.tooManyHouseholds` |

  Invitasjonen blir ikke brukt opp når en grense nås.
- Begrensning av forsøk på `preview` og `accept`:
  - 10 per bruker per 15 minutter (i minnet, `WindowLimiter`)
  - 30 per IP-adresse per 15 minutter (`RATE_LIMIT_INVITATION_MAX`)
- **Den invitertes egne data** blir værende i den egne husholdningen. Ingenting slås sammen eller slettes. Siden
  sier det før brukeren godtar.

### FR-HH-003 Roller

| Handling | Medlem | Eier |
|---|---|---|
| Lese og endre lager, kjøp, budsjett, handleliste, måltidsplan og kvitteringer | ✓ | ✓ |
| Se medlemslisten (visningsnavn, rolle, når de ble med) | ✓ | ✓ |
| Velge om egne allergier deles | ✓ | ✓ |
| Forlate | ✓ | – (må overføre først) |
| Invitere, se og trekke tilbake invitasjoner | – | ✓ |
| Fjerne et medlem | – | ✓ (ikke seg selv) |
| Gi nytt navn (1–100 tegn) | – | ✓ |
| Overføre eierskap (passord kreves) | – | ✓ |
| Slette husholdningen (passord og avkrysning) | – | ✓ |

- Rollene sjekkes på serveren med `requireOwner` etter `householdAccess`. Ikke medlem: 404, som før. Medlem uten
  rett: **403** `errors.household.ownerOnly`. Medlemskapet er da kjent, så 403 avslører ingenting.
- **Nøyaktig én eier:** en delvis unik indeks (`household_members(household_id) WHERE role = 'owner'`). Ved
  overføring settes den gamle eieren til medlem før den nye blir eier, i én transaksjon.
- Medlemslisten viser ikke e-postadresser og ikke hvem som deler allergier.

### FR-HH-004 Aktiv husholdning og bytte
- `users.active_household_id` (SET NULL). `GET /auth/session` og `/me` sjekker valget mot medlemskapene. Er
  brukeren ikke medlem lenger, brukes den eldste husholdningen.
- `SessionUser` får `householdRole` og `households` (id, navn, rolle) for velgeren.
- `PUT /me/active-household` bytter. Ikke medlem: 404.
- Har brukeren mer enn én husholdning, står navnet på den aktive i toppfeltet. Velgeren ligger på `/husholdning`.
- **Ingen skriving havner i feil husholdning:** hver forespørsel har husholdnings-ID-en i URL-en til siden den ble
  sendt fra, og serveren sjekker medlemskapet. Ved bytte fjerner nettappen spørringene til den gamle husholdningen.

### FR-HH-005 Forlate, fjerne og slette
- Et medlem kan forlate (`POST /households/:id/leave`). Eieren får 409 `errors.household.ownerMustTransfer`.
- Eieren kan fjerne et medlem (`DELETE /households/:id/members/:userId`). Seg selv: 400
  `errors.household.cannotRemoveSelf`. Ukjent eller ikke medlem: 404.
- Eieren kan slette husholdningen. Alt i den slettes (CASCADE), for alle medlemmene.
- **Alle har alltid minst én husholdning:** står noen uten etter utmelding, fjerning eller sletting, får de en ny,
  tom husholdning av én i samme transaksjon. Den har standardsteder og handleliste, som ved registrering.
- **Data et medlem har laget** (kjøp, handlelistelinjer, måltider, kvitteringer, hendelser i lageret) blir i
  husholdningen. `created_by` beholdes, men navnet vises bare for nåværende medlemmer (FR-HH-007).
- **Ingen lekkasje etter utmelding:**
  - Serveren sjekker medlemskapet i databasen ved hver forespørsel. Det finnes ikke noe hurtiglager for
    medlemskap, så en fjerning virker med en gang.
  - I nettappen gjør en 404 at sesjonen hentes på nytt. Når den aktive husholdningen har endret seg, fjernes
    alle spørringer under `['household', gammelId]`. Har brukeren mistet medlemskapet, vises
    «Du er ikke lenger medlem av ‹navn›».
- Alle endringer i medlemskap låser husholdningsraden (`FOR UPDATE`).

### FR-AUTH-005 (endret) Sletting av konto
- Husholdninger der brukeren er alene, slettes som før.
- Er brukeren eier av en delt husholdning, går eierskapet til medlemmet som har vært med lengst (eldste
  `created_at`), i samme transaksjon. Husholdningen og dataene blir værende.
- Slettedialogen sier dette før brukeren bekrefter.

### FR-HH-006 Allergier i husholdningen
- `household_members.share_allergens` (standard `false`). Brukeren velger per husholdning under
  Profil → Allergier (`PATCH /households/:id/members/me`).
- Teksten forklarer:
  - at andre medlemmer ser *hvilke* allergener som er registrert i husholdningen, men ikke *hvem* som har dem
  - at det likevel kan skjønnes i en liten husholdning
  - at valget kan slås av når som helst
- Oppskriftslisten, oppskriften og måltidsplanen får `householdAllergenWarnings`: allergener som delte
  medlemmer har registrert, og som brukeren ikke har selv. Bare **nåværende** medlemmer med deling på teller.
- Oppskrifter med slike allergener skjules som standard på samme måte som med egne allergier. Merkelappen er ulik:

  | Hvem | Tekst |
  |---|---|
  | Egne | «Inneholder melk» |
  | Husholdningens | «Inneholder egg (registrert i husholdningen)» |

  Det vises aldri navn.
- Ordlyden og forbeholdet fra fase 5 gjelder, og det står aldri at noe er fritt for et allergen.

### FR-HH-007 Hvem la til hva
- Handlelistelinjer, kjøp, måltider i planen og varehistorikken får `createdBy`, med disse verdiene:

  | Verdi | Betyr |
  |---|---|
  | `{ kind: 'member', displayName }` | Nåværende medlem |
  | `{ kind: 'former' }` | Tidligere medlem |
  | `{ kind: 'unknown' }` | Slettet konto (`created_by` er tom) |

- Det vises bare når husholdningen har mer enn ett medlem, eller når den som laget det ikke er medlem lenger.

## Datamodell (migrering `households_sharing`)

| Endring | Merknad |
|---|---|
| `household_invitations` | `id`, `household_id` (CASCADE), `token_hash` (char 64, unik), `created_by` (SET NULL), `created_at`, `expires_at`, `used_at?`, `used_by?` (SET NULL), `revoked_at?`. CHECK: ikke både brukt og tilbaketrukket. Indeks på `(household_id, created_at)`. |
| `household_members.share_allergens` | `boolean`, standard `false` |
| `household_members_one_owner` | Delvis unik indeks på `household_id` der `role = 'owner'` |
| `users.active_household_id` | Fremmednøkkel til `households`, SET NULL |

## API

| Metode | Sti | Krever |
|---|---|---|
| GET | `/households/:householdId` | medlem (svaret får `shareAllergens`) |
| PATCH | `/households/:householdId` | eier |
| DELETE | `/households/:householdId` | eier, passord, rate limit |
| GET | `/households/:householdId/members` | medlem |
| PATCH | `/households/:householdId/members/me` | medlem |
| DELETE | `/households/:householdId/members/:userId` | eier |
| POST | `/households/:householdId/leave` | medlem, ikke eier |
| POST | `/households/:householdId/transfer-ownership` | eier, passord, rate limit |
| GET / POST | `/households/:householdId/invitations` | eier |
| DELETE | `/households/:householdId/invitations/:invitationId` | eier |
| POST | `/invitations/preview` | innlogget, rate limit |
| POST | `/invitations/accept` | innlogget, rate limit |
| PUT | `/me/active-household` | innlogget, medlem |

Alle endrende forespørsler krever Origin og CSRF-token, som før. Se [api-documentation.md](../api-documentation.md).

## Web

| Side | Innhold |
|---|---|
| `/husholdning` | Velger (flere husholdninger), navn (eieren kan endre), medlemmer, invitasjoner (eier), «Forlat husholdningen» (medlem), overføring og sletting (eier) |
| `/bli-med` | Hvem inviterer til hva, forklaring om egne data, Godta / Avslå. Offentlig rute: uten innlogging vises lenker til innlogging og registrering. |
| Profil → Allergier | Bryter for deling per husholdning |
| Toppfeltet | Navnet på den aktive husholdningen når det er flere |

- Mobil først (360 px). Tomme tilstander («Du er alene i husholdningen»), lasting og feil.
- Dialogene bruker `components/Dialog`, og meldinger går til skjermlesere via `aria-live` (toast).

## Sikkerhet
- IDOR: hvert nytt endepunkt testes med en annen husholdnings ID i URL-en og med en annens medlems- eller
  invitasjons-ID.
- Roller: et medlem får 403 på alle eierhandlingene, og ingenting endres.
- Invitasjonen:
  - bare hashen lagres
  - tokenet står aldri i URL-en til serveren og aldri i logger eller feilmeldinger (testet)
  - samme feil for alle ugyldige tilstander
  - begrensning av forsøk
- Samtidighet: 10 brukere godtar samme invitasjon samtidig → nøyaktig 1 nytt medlem.
- Passord kreves for overføring og sletting, og teller mot grensen `sensitive`.

## Utenfor fasen
- invitasjon på e-post (FR-AUTH-006)
- QR-kode
- flere eiere
- sammenslåing av to husholdningers data
- flytting av varer mellom husholdninger
- sanntidsoppdatering mellom medlemmer (data hentes på nytt ved fokus, som før)
- budsjett per person

## Til gjennomgang for teamet
1. **Personvern:** Les teksten om deling av allergier og kapittel 12. Er samtykket tydelig nok (art. 9 nr. 2 a)? Dette
   må teamet vurdere selv.
2. **Prøv flyten med to kontoer**, gjerne på to telefoner:
   1. inviter, godta, se samme matlager og handleliste
   2. forlat husholdningen, og sjekk at den er borte
3. **Kode:** Les `apps/api/src/modules/households/repo.ts` (låsing, én eier, minst én husholdning) og
   `apps/api/test/households.security.api.test.ts`. Mangler det noen tilfeller?
4. **Avgjørelsene** i tabellen øverst, særlig automatisk overføring ved sletting av konto.
5. Registrer gjennomgangen i utviklingsloggen og KI-loggen (hvem, dato, hva dere så på).
