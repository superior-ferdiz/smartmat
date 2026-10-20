# Teknisk implementering

> **Status: UTKAST.** Første del skrevet etter fase 1 (2026-10-20). Koden og teksten er skrevet av KI (Claude) og
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

## Lagring i nettleseren

Bare tema og språk lagres i `localStorage`. All tilgang er pakket inn i `try/catch`, fordi lagring kan være blokkert
(privat modus, strenge personvernvalg). Appen virker da fortsatt, men valget gjelder bare til siden lastes på nytt.
Dette er testet. Sesjoner og innlogging lagres aldri her (ADR-0005).

## Kjente begrensninger etter fase 1

- **Bundle på 517 kB** (163 kB gzip) i én fil. Vite advarer om dette. Kodedeling per side, eventuelt `zod/mini`,
  vurderes når appen har ekte sider.
- **ESLint 9** er ikke lenger støttet av ESLint-prosjektet, men eslint-plugin-jsx-a11y finnes ennå ikke for
  ESLint 10. Bør sjekkes på nytt i fase 13.
- `exactOptionalPropertyTypes` ble prøvd i TypeScript-oppsettet og fjernet igjen, fordi den gjorde det tungvint å
  sende valgfrie props videre i React.

## Kilder i prosjektet

- [ADR-0001](../development/architecture-decisions/0001-monorepo-npm-workspaces.md),
  [ADR-0004](../development/architecture-decisions/0004-ren-css-uten-tailwind.md),
  [ADR-0006](../development/architecture-decisions/0006-penger-og-mengder-som-heltall.md)
- [Fasespesifikasjon 01](../development/requirements/01-designsystem-og-app-skall.md)
- [Testbevis fase 1](../evidence/test-results/fase-1/)
