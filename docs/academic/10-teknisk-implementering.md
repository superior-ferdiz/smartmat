# Teknisk implementering

> **Status: UTKAST.** Skrevet etter fase 1, 2 (2026-10-20) og 3 (2026-10-21). Koden og teksten er skrevet av KI (Claude) og
> ikke gjennomgått av teamet ennå. Kapittelet utvides i senere faser. Offisielle APP2000-krav til rapporten er ikke verifisert.

## Oversikt (fase 1)

| Del | Teknologi | Versjon |
|---|---|---|
| Monorepo | npm workspaces | npm 11.1, Node 22.14 |
| Frontend | React, Vite, React Router, TanStack Query | 19.3 / 7.3 / 7.18 / 5.104 |
| Språk | TypeScript (`strict`, `noUncheckedIndexedAccess`) | 6.0 |
| Oversettelse | i18next + react-i18next | 26.5 / 17.1 |
| Validering | Zod | 4.6 |
| Testing | Vitest, Testing Library, Playwright, axe-core | 4.1 / 16.3 / 1.63 / 4.14 |
| Kodekvalitet | ESLint (med jsx-a11y og i18next), Prettier | 9.39 / 3.9 |

```
SmartMat/
├── apps/web/            React-appen
│   └── src/
│       ├── styles/      tokens.css, reset.css, global.css
│       ├── components/  grunnkomponenter, hver med .tsx + .module.css
│       ├── layout/      AppShell, SideNav, BottomNav, TopBar, Page
│       ├── pages/       én side per rute
│       ├── i18n/        oppsett og nb-NO.json / en.json
│       └── app/         ruter, navigasjon, tema, providers
├── packages/shared/     Zod-skjemaer og øre-hjelpere (brukes også av API-et fra fase 2)
└── e2e/                 Playwright-tester
```

### Versjonsvalg

De nyeste hovedversjonene av flere verktøy kunne ikke brukes sammen:

- typescript-eslint støtter TypeScript under 6.1, så vi bruker TypeScript 6.0 og ikke 7.
- eslint-plugin-jsx-a11y støtter ikke ESLint 10, så vi bruker ESLint 9. npm melder at ESLint 9 ikke lenger er
  støttet. Det er en kjent begrensning, se under.
- react-router 8 krever Node 22.22, og maskinen har 22.14, så vi bruker react-router 7.
- vitest 4 tillater Vite 8, og da hentet npm Vite 8 i tillegg til Vite 7. Det ga en krasj i npm
  (`Cannot read properties of null (reading 'edgesOut')`). Vite er derfor låst til 7.3.7 med `overrides` i
  rot-`package.json`.
- Playwright er låst til 1.63.0, fordi den versjonen bruker en Chromium som allerede var lastet ned på maskinen.

Alle versjoner er eksakte (ingen `^`) og låst i `package-lock.json`.

## Eksempel 1: penger som heltall i øre

**Formål:** brukeren skriver «49,90», og systemet skal lagre 4990 øre uten flyttallsfeil (ADR-0006, FR-SHR-001).

**Løsning:** `packages/shared/src/money/ore.ts`. `parseOre` bruker et regulært uttrykk til å dele teksten i fortegn,
kroner og desimaler, og setter sammen sifrene til en streng (`"49" + "90"` → `"4990"`). Strengen gjøres om til tall
først til slutt, og det sjekkes at resultatet er et «trygt heltall» (`Number.isSafeInteger`). Funksjonen bruker aldri
`parseFloat` eller deling.

Den godtar det nordmenn faktisk skriver: `49,90`, `49.90`, `1 234,50`, `49,-` og `49,90 kr`. Den avviser tre
desimaler (`49,999`) i stedet for å runde av i stillhet. Resultatet er en «result»-verdi
(`{ ok: true, value }` eller `{ ok: false, error }`), ikke et unntak, slik at skjemaer kan vise riktig feilmelding.

`formatOre` går motsatt vei. Kroner og øre regnes ut med heltallsaritmetikk: `(abs - abs % 100) / 100` er alltid
eksakt. Tusenskillet kommer fra `Intl.NumberFormat('nb-NO')`. Resultatet bruker hardt mellomrom og Unicode-minus,
slik Intl gjør for norsk.

**Hvorfor:** `0.1 + 0.2 !== 0.3` i JavaScript. Når alt er heltall, blir summer i budsjettet alltid riktige.

**Testing:** 61 enhetstester, blant annet grenseverdier (0, negative tall, største trygge beløp), ugyldig input og
at `parseOre(formatOre(x)) === x` for et utvalg verdier (`ore.test.ts`).

**Begrensning:** bare NOK. Valuta lagres i databasen fra fase 4 (ADR-0006), men formatering for andre valutaer er
ikke laget.

## Eksempel 2: ett skjema for validering på klient og server

`packages/shared/src/schemas/common.ts` har Zod-skjemaer som skal brukes både i nettleseren og i API-et (fra fase 2).
Feilmeldingene er **oversettelsesnøkler**, ikke ferdige setninger:

```ts
export const oreAmountSchema = z
  .number({ error: 'validation.ore.required' })
  .max(Number.MAX_SAFE_INTEGER, { error: 'validation.ore.out_of_range' })
  .int({ error: 'validation.ore.integer' })
  .nonnegative({ error: 'validation.ore.negative' });
```

Appen oversetter nøkkelen til valgt språk (`useValidationMessage`). En test (`locales.test.ts`) leser kildekoden i
`packages/shared` og sjekker at alle `validation.*`-nøkler finnes på både norsk og engelsk. Dermed kan ingen glemme en
oversettelse når et nytt skjema legges til.

Rekkefølgen `max` før `int` er bevisst: Zod 4 sin `int()` avviser også tall som er for store, og da ville brukeren
fått den misvisende meldingen «Beløpet må være i hele øre» (se kapittel 11).

## Eksempel 3: tilgjengelige skjemafelt

Alle skjemakomponentene (`TextField`, `NumberField`, `Select`, `DateField`) bruker én felles `Field`-komponent som
lager etikett, hjelpetekst og feilmelding og gir feltet riktige attributter. Field bruker en «render prop»:

```tsx
<Field label={label} hint={hint} error={error} optional={optional} id={id}>
  {(a11y) => <input {...input} {...a11y} type="date" className={fieldStyles.control} />}
</Field>
```

`a11y` inneholder `id`, `aria-describedby` (hjelp + feil), `aria-invalid` og `aria-required`. Reglene ligger dermed
ett sted, og en ny feltkomponent kan ikke glemme dem.

**Valg:** vi bruker `aria-required` og ikke `required`. Det native attributtet viser nettleserens egne feilbobler, og
de kan ikke oversettes og krasjer med våre egne meldinger.

## Eksempel 4: ingen hardkodet tekst

All tekst i grensesnittet ligger i `apps/web/src/i18n/locales/nb-NO.json` og `en.json` (NFR-UX-004). Tre mekanismer
holder dette i orden:

1. **ESLint** (`i18next/no-literal-string`) feiler hvis noen skriver tekst rett i JSX.
2. **Typede nøkler:** `i18next.d.ts` gjør nøklene til TypeScript-typer. En skrivefeil i `t('nav.sections.inventry')`
   stopper bygget. Dette fant en reell feil under utviklingen: «Mer»-siden kunne be om beskrivelser som ikke fantes.
3. **Test** (`locales.test.ts`): norsk og engelsk har nøyaktig de samme nøklene, og ingen er tomme.

Norsk er alltid standard. Vi gjetter ikke språk fra nettleseren, fordi målgruppen er norske husholdninger.

## Eksempel 5: én kilde for navigasjonen

`apps/web/src/app/navigation.ts` beskriver de 9 seksjonene (sti, ikon, om de står i bunnmenyen, om de kommer
senere). Sidemenyen, bunnmenyen og «Mer»-siden lages alle fra denne listen. En ny seksjon legges altså til ett sted.

## Fase 2: API, database og innlogging

| Del | Teknologi | Versjon |
|---|---|---|
| API | Fastify, fastify-type-provider-zod, @fastify/cookie, @fastify/rate-limit, @fastify/helmet | 5.12 / 7.0 / 11.1 / 11.2 / 13.2 |
| Database | PostgreSQL i Docker (`postgres:16-alpine`) | 16 |
| ORM og migreringer | Prisma med driver-adapter for node-postgres | 7.10 |
| Passord | argon2 (argon2id) | 0.45 |
| Kjøring | tsx (TypeScript direkte, uten byggesteg) | 4.23 |

```
apps/api/
├── src/
│   ├── app.ts            setter sammen API-et (brukes av server.ts og testene)
│   ├── server.ts         starter API-et på 127.0.0.1:3100
│   ├── config.ts         leser og sjekker .env
│   ├── plugins/          origin.ts, auth.ts (sesjon/CSRF), errors.ts
│   ├── authz/            household.ts – autorisasjonsmønsteret
│   └── modules/          auth, profile, households, health – hver med routes/service/repo
├── test/                 API-tester mot ekte database
└── scripts/e2e-server.ts API-instans for Playwright
prisma/                   schema.prisma og migreringer
docker/compose.yml        Postgres for lokal utvikling
```

**Versjoner:** `npm install prisma@latest` ville gitt en release-kandidat (8.0.0-rc), fordi Prisma hadde satt den som
`latest`. Vi bruker siste stabile, 7.10.1. Prisma 7 leser ikke `.env` selv, så `prisma.config.ts` laster filen med
Node sin innebygde `process.loadEnvFile` (ingen ekstra pakke).

## Eksempel 6: autorisasjon for husholdningsdata

Alle ruter for husholdningsdata bruker det samme mønsteret (`apps/api/src/authz/household.ts`):

```ts
app.get('/households/:householdId', { preHandler: [requireAuth, householdAccess] }, async (request) => {
  const access = householdOf(request); // { id, role } – sjekket mot databasen
  ...
});
```

`householdAccess` slår opp om den innloggede brukeren er medlem av husholdningen i URL-en. Er brukeren ikke medlem,
svarer API-et 404, akkurat som for en husholdning som ikke finnes. Med 403 kunne en angriper lært at ID-en finnes.
Rutekoden bruker bare `request.household.id`, aldri en ID fra forespørselens kropp.

## Eksempel 7: samme svar ved feil passord, ukjent e-post og sperret konto

```ts
if (!user || isLocked(user.loginLockedUntil, now)) {
  await hasher.verify(await this.getDummyHash(), input.password); // like mye arbeid
  throw new AppError(401, API_ERRORS.invalidCredentials);
}
```

argon2id tar merkbar tid med vilje. Hvis API-et svarte raskt for ukjente e-postadresser, kunne man målt svartiden og
funnet ut hvem som har konto. Derfor sjekkes passordet mot en dummy-hash også da.

## Eksempel 8: sesjoner som kan trekkes tilbake

Nettleseren får et tilfeldig token på 256 bit i en `HttpOnly`-cookie. Databasen lagrer bare SHA-256 av tokenet. Ved
hver forespørsel hashes cookien og slås opp. Utlogging og passordbytte sletter rader, og da virker sesjonen ikke
lenger. Det kan ikke gjøres med en JWT som ligger hos klienten (ADR-0005).

Sesjonen utløper 14 dager etter siste bruk. Bruken skrives tilbake til databasen høyst hvert femte minutt. Uansett
bruk utløper sesjonen 30 dager etter innlogging. Cookien varer til den absolutte grensen på 30 dager. Den skal ikke
følge grensen for inaktivitet, for da ville nettleseren kastet den mens sesjonen fortsatt var gyldig. Den feilen ble
funnet i en røyktest under implementeringen (kapittel 11).

## Eksempel 9: feilmeldinger som i18n-nøkler

API-et svarer aldri med ferdig tekst, bare med koder:

```json
{ "error": { "code": "errors.validation", "fields": { "email": "validation.email.invalid" } } }
```

Kodene ligger i `packages/shared/src/api/errors.ts`. Web-appen oversetter dem med samme oppslag som for
valideringsmeldinger. En test sjekker at alle feilkoder API-et kan returnere, finnes på norsk og engelsk.

## Innlogging i web-appen

- `useSession` (TanStack Query) spør `GET /api/v1/auth/session`. `null` betyr «ikke innlogget».
- `RequireAuth` omslutter alle sider med brukerdata. `GuestOnly` omslutter innlogging og registrering, og sender
  innloggede brukere videre til `?neste`. Det er også dette som flytter brukeren videre rett etter innlogging.
- Får en forespørsel svaret «ikke innlogget» (for eksempel fordi sesjonen gikk ut i en annen fane), settes sesjonen
  til `null` i hurtigbufferen (`queryClient.ts`), og brukeren sendes til innlogging.
- CSRF-tokenet ligger bare i minnet og sendes med i headeren `X-CSRF-Token` på POST/PATCH/DELETE (`api/client.ts`).
- Vite videresender `/api` til API-et, både i utvikling (`npm run dev`) og i `vite preview` (Playwright).

## Fase 3: matlageret

```
apps/api/src/modules/
├── inventory/   routes, service (regler: angre, verdi av kassert mat), repo (transaksjoner)
└── locations/   lagringssteder og kategorier
packages/shared/src/
├── quantity/    parseQuantity/formatQuantity, expiryStatus
├── dates/       «i dag» i Europe/Oslo, månedsgrenser
└── money/waste  verdiestimat med BigInt
apps/web/src/
├── inventory/   API-hooks, filtrering, formatering, felt for parti
├── components/Dialog/
└── pages/inventory/  Matlager, Ny vare, Vare, Lagringssteder
```

## Eksempel 10: mengder uten flyttall

`parseQuantity("1,5", "kg")` gir `1500` (gram). Funksjonen regner på sifrene som tekst, slik `parseOre` gjør:

```ts
// (whole + fraction/scale) × factor must be an integer, i.e. fraction × factor divisible by scale.
const fractionPart = Number(fraction || '0') * factor;
if (fractionPart % scale !== 0) return { ok: false, error: 'validation.quantity.notWhole' };
```

«1,2345 kg» avvises i stedet for å bli rundet av til 1234 g. En test sjekker at hver formaterte mengde kan leses
tilbake til nøyaktig samme tall.

## Eksempel 11: samtidige forespørsler kan ikke gi negativ mengde

Forbruk og kassering trekker fra med en betingelse i selve SQL-setningen:

```ts
const { count } = await tx.inventoryBatch.updateMany({
  where: { id: batch.id, householdId, quantityBase: { gte: quantity } },
  data: { quantityBase: { decrement: quantity } },
});
if (count === 0) return 'notEnough';
```

Hvis koden først leste mengden og så skrev den nye, kunne to samtidige klikk begge sett «500 igjen». En test
sender ti forespørsler samtidig mot et parti på 500 g, der hver tar 100 g. Nøyaktig fem lykkes, og mengden ender
på 0.

## Eksempel 12: «i dag» i Norge

`expiryStatus` sammenligner kalenderdatoer, og «i dag» regnes i tidssonen Europe/Oslo med `Intl.DateTimeFormat`.
Klokken 01:30 norsk tid er det fortsatt gårsdagen i UTC. Hadde vi brukt UTC, ville en vare med siste forbruksdag
«i går» blitt vist som «i dag» den første timen etter midnatt. Testene dekker midnatt, nyttår og overgangen
mellom sommer- og vintertid. Svinnoppsummeringen bruker samme regel i SQL:
`(dato)::timestamp AT TIME ZONE 'Europe/Oslo'`.

## Eksempel 13: filtrering i nettleseren (KURS-03)

Lageret hentes én gang, og søk, filtre og sortering skjer i nettleseren med rene funksjoner (`inventory/filter.ts`).
Valgene ligger i URL-en (`?q=melk&status=snart`), slik at visningen kan deles og overlever omlasting. Navn
sorteres med `Intl.Collator('nb-NO')`, så Æ, Ø og Å kommer sist.

## Eksempel 14: dialog med `<dialog>`

`components/Dialog` bruker HTML-elementet `<dialog>` med `showModal()`. Nettleseren gjør da resten av siden
utilgjengelig, Esc lukker dialogen, og fokus går tilbake til knappen som åpnet den. Dette er testet i Playwright,
fordi jsdom ikke har `showModal`. Testoppsettet har en enkel erstatning som bare setter `open`. På telefon vises
dialogen som et ark nederst på skjermen.

## Lagring i nettleseren

Bare tema og språk lagres i `localStorage`. All tilgang er pakket inn i `try/catch`, fordi lagring kan være blokkert
(privat modus, strenge personvernvalg). Appen virker da fortsatt, men valget gjelder bare til siden lastes på nytt.
Dette er testet. Sesjoner og innlogging lagres aldri her (ADR-0005).

## Kjente begrensninger etter fase 2

- **Bundle på 619 kB** (191 kB gzip) i én fil, opp fra 566 kB i fase 2 og 517 kB i fase 1. Vite advarer om dette.
  Kodedeling per side bør vurderes snart. Kodedeling per side, eventuelt `zod/mini`,
  vurderes når appen har ekte sider.
- **ESLint 9** er ikke lenger støttet av ESLint-prosjektet, men eslint-plugin-jsx-a11y finnes ennå ikke for
  ESLint 10. Bør sjekkes på nytt i fase 13.
- `exactOptionalPropertyTypes` ble prøvd i TypeScript-oppsettet og fjernet igjen, fordi den gjorde det tungvint å
  sende valgfrie props videre i React.
- API-et kjøres med tsx uten byggesteg. Det holder lokalt. Et produksjonsbygg kommer i fase 13.
- Den genererte Prisma-klienten (`apps/api/src/generated/`) er ikke i Git. Den lages av `npm install` (`postinstall`).

## Kilder i prosjektet

- [ADR-0001](../development/architecture-decisions/0001-monorepo-npm-workspaces.md),
  [ADR-0004](../development/architecture-decisions/0004-ren-css-uten-tailwind.md),
  [ADR-0006](../development/architecture-decisions/0006-penger-og-mengder-som-heltall.md)
- [Fasespesifikasjon 01](../development/requirements/01-designsystem-og-app-skall.md)
- [ADR-0002](../development/architecture-decisions/0002-fastify-rest-api.md),
  [ADR-0003](../development/architecture-decisions/0003-postgresql-prisma.md),
  [ADR-0005](../development/architecture-decisions/0005-sesjoner-og-argon2id.md),
  [ADR-0008](../development/architecture-decisions/0008-husholdning-fra-start.md)
- [Fasespesifikasjon 02](../development/requirements/02-database-og-autentisering.md),
  [fasespesifikasjon 03](../development/requirements/03-matlager.md)
- [Testbevis fase 1](../evidence/test-results/fase-1/), [testbevis fase 2](../evidence/test-results/fase-2/)
