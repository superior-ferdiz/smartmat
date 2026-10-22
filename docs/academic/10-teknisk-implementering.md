# Teknisk implementering

> **Status: UTKAST.** Skrevet etter fase 1, 2 (2026-10-20), 3 og 4 (2026-10-21). Koden og teksten er skrevet av KI (Claude) og
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

## Fase 4: kjøp og budsjett

```
apps/api/src/modules/
├── purchases/   routes, service (regler: sum, dato, vare/sted i husholdningen), repo (én transaksjon)
└── budget/      budsjett per måned og månedsoversikt (SQL-summer)
packages/shared/src/
├── schemas/purchases  linjer ELLER totalsum, grenser, lagerdel av en linje
└── money/budget       sumOre, usedPercent (BigInt), monthFigures
apps/web/src/
├── purchases/   API-hooks, skjemalogikk (purchaseForm.ts), PurchaseForm, BudgetFigures
└── pages/budget/  Budsjett, Registrer kjøp, Kjøp, Rett kjøp
```

## Eksempel 15: kjøp, linjer og partier i én transaksjon (ADR-0007)

Et kjøp med «Legg i matlageret» skriver i fem tabeller: kjøpet, linjene, nye varer, partier og `add`-hendelser.
Alt skjer i én `db.$transaction`. Partiet lages med samme hjelpefunksjon som matlageret bruker
(`insertBatchWithEvent`), så et parti fra et kjøp ser likt ut som et parti lagt inn for hånd.

```ts
return await db.$transaction(async (tx) => {
  const created = await tx.purchase.create({ data: { householdId, ..., dedupeKey } });
  for (const line of purchase.lines) await createLine(tx, householdId, actorId, created.id, line);
  return created.id;
});
```

En test går forbi servicens kontroller og gir den andre linjen et sted som ikke finnes. Databasen avviser partiet
etter at kjøpet, den første linjen og dens parti allerede er skrevet. Testen sjekker at alle fem tabellene er tomme
etterpå.

## Eksempel 16: totalsummen regnes alltid av serveren

Et kjøp har linjer **eller** en totalsum. Det delte Zod-skjemaet avviser begge deler samtidig, og servicen setter
totalsummen selv:

```ts
export function purchaseTotal(lines: readonly { amountOre: number }[], totalOre?: number | null) {
  return lines.length > 0 ? sumOre(lines.map((l) => l.amountOre)) : (totalOre ?? 0);
}
```

Dermed kan ikke den lagrede summen være uenig med linjene. `sumOre` kaster en feil i stedet for å runde av hvis en
sum ikke lenger er et trygt heltall. Andelen brukt regnes med `BigInt` og rundes **ned**, så «100 %» vises først når
budsjettet faktisk er brukt opp.

## Eksempel 17: samme skjema sendt to ganger (NFR-DATA-002)

Skjemaet lager en tilfeldig `clientRequestId` når siden åpnes. Den lagres som `dedupe_key`, som er unik per
husholdning. Kommer samme ID igjen, svarer API-et med det første kjøpet (200 i stedet for 201). Sendes to
forespørsler helt samtidig, stopper den unike begrensningen den ene. Transaksjonen dens rulles tilbake, og servicen
henter det kjøpet som ble lagret. En API-test sender fem like forespørsler samtidig og får ett kjøp, ett parti og
én vare. En Playwright-test dobbeltklikker på «Lagre kjøpet».

## Eksempel 18: sletting av kjøp uten å miste historikk

Når et kjøp slettes, låses partiene fra kjøpet før koden sjekker om de er urørte:

```sql
SELECT b.id, (b.quantity_base = b.initial_quantity_base AND NOT EXISTS (
         SELECT 1 FROM inventory_events e WHERE e.batch_id = b.id AND e.type <> 'add')) AS untouched
FROM inventory_batches b WHERE b.household_id = $1 AND b.purchase_line_id = ANY($2) FOR UPDATE OF b
```

Urørte partier slettes, og alle andre beholdes med koblingen tømt. Kommer et forbruk samtidig, venter det til
slettingen er ferdig (og får da 404), eller så er det ferdig først (og partiet regnes som rørt og beholdes). En test
kjører sletting og forbruk samtidig åtte ganger og sjekker at partiet aldri forsvinner etter et vellykket forbruk.

## Eksempel 19: skjemafeil fra server og nettleser på samme felt

`purchaseForm.ts` gjør skjemaet om til en API-kropp med de samme delte parserne og samme Zod-skjema som serveren.
Feilnøklene er API-ets feltnavn (`lines.0.amountOre`, `lines.1.toInventory.locationId`). En feil fra serveren, for
eksempel en kjøpsdato frem i tid, havner derfor på samme felt som en feil funnet i nettleseren.

## Eksempel 20: fra varenavn til ingrediens (spesifikasjon 05)

Varen har et fritt navn («Tine lettmelk 1 l»), og oppskriften bruker ingrediensen «melk». `normalizeWords` gjør navnet
om til ord (små bokstaver, uten tegnsetting og mengder): `["tine", "lettmelk"]`. Så prøves hver sammenhengende rekke
av ord mot aliasene. Aliaset med flest ord vinner («rød løk» slår «løk»). Treffer to ulike ingredienser med like mange
ord, blir det ingen kobling i stedet for en gjetning. Siden det sammenlignes hele ord, er «kokosmelk» ikke «melk».
Funksjonen ligger i `packages/shared` og brukes både av API-et (rangering) og av varesiden (som viser koblingen).

*Endret under implementeringen:* Først avgjorde flest tegn når antall ord var likt. En test viste at «smør og melk»
da ble smør bare fordi ordet tilfeldigvis er like langt, og at «Kyllingfilet med løk» ble kylling fordi ordet er
lengre. Regelen ble fjernet.

## Eksempel 21: poengsum som forklarer seg selv (FR-REC-002)

`scoreRecipe` regner bare med heltall: dekning `floor(100 × poeng / (2 × påkrevde))` (nok = 2, litt = 1) pluss 10 for
hver av høyst tre påkrevde ingredienser som snart går ut. Funksjonen returnerer ikke bare summen, men også en liste
med grunner (`{ code: 'coverage', points: 25, enough: 1, partial: 0, required: 4 }` osv.). Nettleseren gjør
grunnene om til tekst på brukerens språk, så forklaringen og summen kan aldri bli uenige. Omregning mellom enheter
rundes ned (`Math.floor`), så appen heller sier at det mangler litt enn at det er nok.

## Eksempel 22: allergener uten å love for mye (FR-REC-004)

Oppskriftens allergener regnes ut fra ingrediensene ved hver visning (også valgfrie og basisvarer), og lagres ikke
for seg. Teksten sier alltid hva som er *registrert*, aldri at noe er *fritt for* et allergen. Forbeholdet ligger i
én komponent (`AllergenDisclaimer`), og en test i `locales.test.ts` stopper ord som «allergenfri» og «free from» i
begge språkfilene.

## Fase 6: handleliste

Handlelisten er laget for å brukes med én hånd i butikken: store rader (minst 44 px), hele teksten er etiketten til
avkrysningsboksen, og avhukingen vises med en gang. Logikken (sammenslåing, forslag fra oppskrift, rekkefølge og
kobling til ingrediens) ligger som rene funksjoner i `packages/shared/src/shopping/list.ts`, som brukes av både API-et
og nettleseren.

## Eksempel 23: én lytter for hele listen (KURS-03, antatt)

`useDelegatedListEvents` (`apps/web/src/shopping/listEvents.ts`) legger **én** `change`-lytter og **én**
`click`-lytter på listen med `addEventListener`, i stedet for én per rad. Hendelsen bobler opp fra avkrysningsboksen
eller knappen som ble brukt, og `event.target.closest('[data-item-id]')` finner raden. Det virker også for rader som
legges til eller flyttes senere, uten at lyttere må legges til eller fjernes. React gjør i praksis det samme internt
(alle `onChange` samles på roten), men her står mekanismen i vår egen kode, så den kan forklares.

Etter en endring flyttes fokus med DOM-API-et: til raden som tok plassen til den som forsvant (`nextElementSibling`
eller `previousElementSibling`), eller til hurtigfeltet når listen er tom. Et skjult `aria-live`-område melder
«Melk er huket av». Avkrysningsboksene er ukontrollerte (`defaultChecked`) og har en nøkkel som endres med
tilstanden, så DOM-en bygges på nytt fra dataene når de endrer seg.

## Eksempel 24: avhuking uten forsinkelse (optimistisk oppdatering)

`useToggleChecked` endrer den bufrede listen i TanStack Query før forespørselen er sendt (`onMutate`). Feiler
forespørselen, settes den gamle listen tilbake (`onError`), og brukeren får en melding. API-et *setter* `checked` til
verdien som sendes, og bytter den aldri, så et nytt forsøk kan ikke snu haken feil vei.

*Funnet under testingen:* Når serveren avviste avhukingen så raskt at React aldri tegnet den optimistiske tilstanden,
var dataene like før og etter. Nøkkelen endret seg da ikke, og den ukontrollerte boksen beholdt haken i DOM-en.
Komponenttesten for tilbakerulling fanget det. Nå får boksene en ny nøkkel (`version`) ved hver tilbakerulling.

## Eksempel 25: fra handleliste til matlager uten doble partier (FR-SHOP-003)

Alt skjer i én databasetransaksjon. Første steg er å slette linjene med en betingelse:
`deleteMany({ where: { householdId, checked: true, id: { in: [...] } } })`. Blir antallet slettet mindre enn antallet
sendt, kastes en feil og alt rulles tilbake (409). Trykker brukeren to ganger, eller sender to telefoner samtidig,
finner den andre forespørselen ingen linjer å slette og lager ingen partier. Deretter lages eventuelle nye varer og
partiene med `insertBatchWithEvent`, slik at de får hendelsen `add` som alle andre partier. Partiene får ingen pris og
ingen kjøpskobling (ADR-0007): handlelisten registrerer ikke utgifter, og dialogen lenker til «Registrer kjøp».

En ny vare fra en linje som kom fra en oppskrift, får ingrediensen satt manuelt (`ingredient_match = manual`) hvis
navnet brukeren valgte, ikke selv treffer ingrediensen. Da matcher varen oppskriften igjen, og oppskriften rangeres
høyere. Det er testet hele veien i Playwright.

## Eksempel 26: sammenslåing uten avrunding (FR-SHOP-002)

`mergeQuantity` legger sammen mengder bare når enheten er den samme. En linje uten mengde («melk») forblir uten
mengde, og en linje i en annen enhet beholder sin mengde. Ingenting regnes om, så ingenting rundes. Oppskriftens
bidrag vises under linjen («Pannekaker: 500 ml»), så brukeren ser hva som trengs.

## Fase 7: strekkodeskanning

Strekkodereglene (kontrollsiffer, UPC-A/UPC-E, butikkens egne koder) ligger som rene funksjoner i
`packages/shared/src/barcode/gtin.ts`. Skjemaet, kameraet og API-et bruker de samme funksjonene. Open Food Facts
nås bare gjennom et provider-grensesnitt (`apps/api/src/providers/barcode/`).

## Eksempel 27: kontrollsifferet (FR-SCAN-003)

Det siste sifferet i en EAN-kode regnes ut fra de andre: annethvert siffer fra høyre ganges med 3, alt summeres, og
kontrollsifferet er det som mangler opp til neste tier. `checkDigit('400638133393')` gir 1, så `4006381333931` er
gyldig. Et feiltastet siffer, eller to naboer som har byttet plass, gir feil sum. Kontrollen stopper derfor de
fleste skrivefeil i nettleseren, før noe sendes. Serveren gjør den samme kontrollen på koden i URL-en. Testverdiene
ble regnet ut for seg (i Python), ikke med funksjonen som testes.

## Eksempel 28: kameraet bare når det trengs (FR-SCAN-001)

- **Nettleserens egen leser først:** finnes `BarcodeDetector` og kan den lese EAN-13, brukes den.
- **Ellers en reserve:** iPhone, Firefox og Chrome på Windows/Linux mangler den. Da lastes `barcode-detector` med
  `zxing-wasm` med `import()`. Kamerakoden lastes med `React.lazy` når brukeren trykker «Start kamera». Hovedbunten
  vokste derfor bare med selve skannesiden (720 → 739 kB). Reserven (43 kB) og wasm-filen (1,09 MB, 461 kB med
  gzip) kommer bare til nettlesere som trenger dem.
- **Wasm fra vår egen server:** biblioteket henter som standard wasm-filen fra jsDelivr. `locateFile` er overstyrt,
  så filen kommer fra vår egen server, og ingen tredjepart får vite at noen skanner.
- **Bildet blir i nettleseren:** én rute hvert 200. ms leses fra `<video>`, og bare tallene går videre. En kode med
  feil kontrollsiffer (feillesing) blir ignorert, og neste bilde prøves.
- **Kameraet slås av:** når en kode er lest, når brukeren trykker «Stopp», forlater siden eller bytter fane
  (`visibilitychange`).

## Eksempel 29: en ekstern tjeneste som kan svikte (NFR-REL-001)

`createOpenFoodFactsProvider` gir alltid ett av tre svar: `found`, `notFound` eller `unavailable`. Tidsavbrudd (3 s
med `AbortSignal.timeout`), nettverksfeil, HTTP-feil, ugyldig JSON, et svar som ikke passer Zod-skjemaet og
serverens egen grense blir alle `unavailable`. Brukeren får da det tomme skjemaet. Bare de to første lagres i
mellomlageret. En feil lagres aldri, så neste skanning prøver igjen. Svarer OFF ikke, men et gammelt treff finnes,
brukes det. Testene erstatter `fetch`, og testoppsettet stopper alle kall ut på nettet (`test/noNetwork.ts`).

## Eksempel 30: ingenting lagres uten bekreftelse (FR-SCAN-005)

Oppslaget (`GET …/barcodes/:gtin`) lagrer ingenting for husholdningen. Først når brukeren trykker «Legg i
matlageret», lager én transaksjon varen (eller et nytt parti på varen fra sist) med `insertBatchWithEvent`, og
lagrer det brukeren bekreftet i `household_barcodes`. Skjemaet har én `clientRequestId` så lenge det er åpent. Den
lagres som `dedupe_key` på partiet, så et dobbeltklikk eller et nytt forsøk etter et tapt svar gir ett parti (200 med
varen fra første gang).

*Funnet under testingen:* Etter bekreftelsen hentes oppslaget på nytt, fordi husholdningen nå kjenner koden. Skjemaet
var nøklet på tidspunktet for svaret og ble derfor bygd på nytt. Da forsvant `onSuccess`-funksjonen som ble sendt
til `mutate`, fordi TanStack Query ikke kaller den når komponenten er borte. Ingen melding kom, og koden ble stående
i URL-en. Playwright fant det. Komponenttesten gjorde ikke det. Nå er skjemaet nøklet bare på koden.

## Eksempel 31: én opprinnelse i testmiljøet (ADR-0015)

I testmiljøet serverer API-et også den ferdigbygde webappen (`@fastify/static`), så side og API har samme
opprinnelse, og cookien er førstepart. Sideruter (`/skann?kode=…`) får `index.html` i 404-behandleren, mens ukjente
`/api`-stier fortsatt får JSON. CSP-en tillater bare egne skript. Det lille temaskriptet i `index.html` får en
sha256-hash som regnes ut ved oppstart, i stedet for `'unsafe-inline'`. `'wasm-unsafe-eval'` trengs for reserveleseren.
Lokalt er alt dette av, og Vite serverer siden som før.

## Lagring i nettleseren

Bare tema og språk lagres i `localStorage`. All tilgang er pakket inn i `try/catch`, fordi lagring kan være blokkert
(privat modus, strenge personvernvalg). Appen virker da fortsatt, men valget gjelder bare til siden lastes på nytt.
Dette er testet. Sesjoner og innlogging lagres aldri her (ADR-0005).

## Kjente begrensninger

- **Bundle på 739 kB** (223 kB gzip) i hovedfilen etter fase 7, opp fra 720 kB i fase 6, 690 kB i fase 5, 658 kB i
  fase 4, 619 kB i fase 3, 566 kB i fase 2 og 517 kB i fase 1. Vite advarer om dette. Skanneren er den første delen
  som er delt ut i egne filer. Kodedeling per side (eventuelt `zod/mini`) bør gjøres snart.
- **ESLint 9** er ikke lenger støttet av ESLint-prosjektet, men eslint-plugin-jsx-a11y finnes ennå ikke for
  ESLint 10. Bør sjekkes på nytt i fase 13.
- `exactOptionalPropertyTypes` ble prøvd i TypeScript-oppsettet og fjernet igjen, fordi den gjorde det tungvint å
  sende valgfrie props videre i React.
- **Rangeringen regnes ut ved hver visning** for alle oppskrifter (ingen hurtiglager). Med 30–50 oppskrifter og et
  vanlig matlager er det raskt nok lokalt. Med mange hundre oppskrifter bør det måles.
- API-et kjøres med tsx uten byggesteg, også i testmiljøet (bildet er 0,9 GB fordi utviklingsavhengighetene er med).
  Et produksjonsbygg kommer i fase 13.
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
