# 11 – Svinnstatistikk og varsler i appen (fase 11)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-25 («Godkjent commit og push»). De seks åpne
spørsmålene ble ikke besvart enkeltvis, så anbefalingene i planen gjelder (se under). Spesifikasjonen er skrevet av
KI (Claude) før implementeringen. Ikke gjennomgått av Linus Saxe Huseby.

**Bygger på:** FR-INV-005/007, FR-BUD-004, FR-HH-007, NFR-SEC-001/002/004, NFR-DATA-001 og NFR-UX-001–004 i
[00-kravoversikt.md](00-kravoversikt.md), samt ADR-0006, ADR-0007, ADR-0008, ADR-0018 og
[ADR-0019](../architecture-decisions/0019-varsler-beregnes-ved-lesing.md).

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Varsler beregnet ved lesing eller lagret av en jobb | Beregnet ved lesing. Bare brukerens tilstand (sett, avvist) lagres (ADR-0019). |
| 2 | Innstillinger per bruker eller per husholdning | Per bruker, og de gjelder alle husholdningene. Ett felles «dager før» for begge datotypene. |
| 3 | Grenser for budsjettvarselet | Faste: 80 % og 100 % |
| 4 | Svinn i prosent av matutgiftene | Tas ikke med (anslått verdi kommer fra kjøp i andre måneder) |
| 5 | Kasseringer for slettede varer | Forsvinner fra statistikken, som før. Svinnsiden sier det. |
| 6 | Varsel når noen blir med eller går ut | Ikke i denne fasen |
| 7 | Plassholderne i prompten | Gjennomgang siden fase 10: ingen. Reglene fra fase 10: ikke godkjent ennå. Art. 9: ikke vurdert ennå. Kontroll av oppskriftene: ingen ennå. ADR-0017: ikke godkjent ennå. |

## Begreper

| Begrep | Betydning |
|---|---|
| **Kassering** | En hendelse `discard` i `inventory_events` som ikke er angret |
| **Kjent verdi** | Summen av faktisk (`actual`) og anslått (`estimated`) verdi |
| **Anslått verdi** | Regnet ut fra partiets pris da varen ble kastet (FR-INV-007) |
| **Ukjent verdi** | Kasseringen har ingen verdi. Den telles, men er ikke med i summen. |
| **Varsel** | Noe appen gjør brukeren oppmerksom på. Regnes ut fra dataene ved hver lesing. |
| **Varselnøkkel** | En fast tekst som identifiserer ett varsel, for eksempel `useBy:today:<parti-id>:2026-10-26` |
| **Sett** | Brukeren har åpnet varselsiden mens varselet var der. Teller ikke lenger som nytt. |
| **Avvist** | Brukeren har fjernet varselet. Det kommer ikke igjen. |

## Svinnstatistikk

### FR-WASTE-001 Månedsoversikt
- `GET /households/:householdId/waste-stats?month=YYYY-MM` (standard: inneværende måned i norsk tid).
- Kilden er kasseringer som ikke er angret. En kassering hører til måneden for `created_at` i Europe/Oslo, som
  forsidekortet fra fase 3.
- For måneden vises:

  | Tall | Regel |
  |---|---|
  | Antall kasseringer | Alle, også med ukjent verdi |
  | Kjent verdi | Faktisk + anslått, i hele øre |
  | Faktisk og anslått | Hver for seg |
  | Ukjent verdi | Antall kasseringer uten verdi |
  | Mengde | Per grunnenhet (g, ml, stk). Legges aldri sammen på tvers. Vises som kg, l og stk. |

- Alle summer regnes med heltall (`bigint` i SQL, så `Number` med kontroll av at tallet er trygt).

### FR-WASTE-002 Fordeling
- **Per årsak** (de fem fra FR-INV-007) og **per kategori** (varens kategori): antall, kjent verdi og andel.
- Andelen er av **antallet** kasseringer, fordi verdien kan mangle. Prosentene regnes med største rest, så de alltid
  blir 100 til sammen.
- Kategorien er den varen har nå. Rettes kategorien, flytter gamle kasseringer seg (står i hjelpeteksten).
- **Mest kastet:** de 5 varene med flest kasseringer i måneden (navn, antall, mengde og kjent verdi). Lik plass
  sorteres etter kjent verdi og så navn.

### FR-WASTE-003 Utvikling over tid
- De 12 månedene fram til og med valgt måned, eldst først. Måneder uten kasseringer er med som 0.
- Per måned: antall, kjent verdi, anslått verdi og antall med ukjent verdi.

### FR-WASTE-004 Ærlige tall
- Appen regner aldri ut en verdi for kasseringer med ukjent verdi, og viser aldri et «totalt anslag».
- Andelen av den kjente verdien som er anslått, er `floor(anslått × 100 / kjent)`. Er andelen over 0, men under 1 %,
  står det «under 1 %».
- Teksten sier hvor mange kasseringer som mangler verdi.
- Statistikken er for husholdningen. Det finnes ingen statistikk per person.
- Kasseringer for en vare som er slettet, er borte. «Slett» er for feilregistreringer (FR-INV-003).

### FR-WASTE-005 Tilgjengelige diagrammer
- Siden `/svinn` har månedsvelger (`?maned=YYYY-MM`), som budsjettet.
- Fordelingene er lister der hver rad har tekst med antall, andel og kroner. Søylen er pynt (`aria-hidden`).
- Utviklingen over tid er en ekte `<table>` med en rad per måned og overskrifter for kolonnene. Søylen står i en celle
  og er pynt.
- Anslått og faktisk verdi skilles med mønster (skravering) og med tekst, ikke bare med farge.
- Alt virker på 360 px uten vannrett rulling. Tomt («Ingenting kastet i oktober»), lasting og feil har egne tilstander.

## Varsler

### FR-NOTIF-001 Datoer
- Regnes ut fra partier med noe igjen og med dato, i den aktive husholdningen. «I dag» er dagens dato i Europe/Oslo.
- `N` = «dager før» fra innstillingene (0–7, standard 1).

  | Varsel | Når (dager igjen) | Nøkkel |
  |---|---|---|
  | `useBySoon` | 1 til N | `useBy:soon:<parti>:<dato>` |
  | `useByToday` | 0 | `useBy:today:<parti>:<dato>` |
  | `useByPassed` | 1 og 2 dager etter | `useBy:passed:<parti>:<dato>` |
  | `bestBeforeSoon` | 1 til N | `bestBefore:soon:<parti>:<dato>` |
  | `bestBeforeToday` | 0 | `bestBefore:today:<parti>:<dato>` |

- Best før har ikke noe varsel etter datoen. Det er et spørsmål om kvalitet, og lageret viser det fortsatt.
- Etter to dager forsvinner «siste forbruksdag passert» fra varslene, men lageret viser det fortsatt.
- **Ordlyd:** forskjellig for de to datotypene.

  | Varsel | Tekst |
  |---|---|
  | `useBySoon` | «Kyllingfilet har siste forbruksdag i morgen» / «… om 3 dager» |
  | `useByToday` | «Kyllingfilet har siste forbruksdag i dag». Råd: «Etter i dag bør den ikke spises.» |
  | `useByPassed` | «Siste forbruksdag for kyllingfilet er passert». Råd: «Bør ikke spises. Siste forbruksdag handler om mattrygghet.» |
  | `bestBeforeSoon` | «Lettmelk er best før i morgen» / «… om 3 dager». Råd: «Ofte fortsatt god etter datoen. Se, lukt og smak.» |
  | `bestBeforeToday` | «Lettmelk er best før i dag». Samme råd. |

- Appen gir aldri råd om å spise mat etter siste forbruksdag, og sier ikke noe om frysing (avgjørelse 6 i fase 3).
  `locales.test.ts` stopper fraser som «kan spises» og «fortsatt god» i tekstene om siste forbruksdag.
- Høyst 50 datovarsler vises, de mest alvorlige først.

### FR-NOTIF-002 Budsjett
- Bruker budsjettoversikten for inneværende måned (FR-BUD-004).

  | Varsel | Når | Nøkkel |
  |---|---|---|
  | `budgetNearlyUsed` | 80–99 % brukt | `budget:<YYYY-MM>:80` |
  | `budgetExceeded` | 100 % eller mer | `budget:<YYYY-MM>:100` |

- Andelen er `floor(brukt × 100 / budsjett)`, som på budsjettsiden. Uten budsjett er det ikke noe varsel.
- Slettes et kjøp så andelen faller, forsvinner varselet.

### FR-NOTIF-003 Handlelisten
- `household_members.shopping_seen_at` er når brukeren sist så handlelisten. Settes til «nå» når man blir medlem, og
  ved migreringen.
- Varselet gjelder åpne (ikke avhukede) linjer som **andre** har lagt til etter dette tidspunktet:
  «Kari la til Melk, Egg og 2 til på handlelisten».
- Navnet vises bare for nåværende medlemmer (FR-HH-007). Ellers står det «et tidligere medlem» eller «en slettet
  konto».
- Når handlelisten åpnes (`POST /households/:id/shopping-list/seen`), flyttes tidspunktet til nå.
- Når varselet avvises, settes tidspunktet til `created_at` for den siste viste linjen, ikke til «nå». En linje som kom
  i mellomtiden, gir da et nytt varsel.
- Nøkkelen er `shopping:<millisekunder for siste linje>`. En eldre nøkkel (fra en side som ble lastet før en ny linje
  kom) godtas også, men tidspunktet flyttes aldri bakover. Se avvik 1.

### FR-NOTIF-004 Lese og avvise
- `GET /households/:householdId/notifications` gir `{ items, unseenCount }`. Bjella viser `unseenCount`.
- `POST …/notifications/seen` med `{ keys }` (1–100) merker varsler som sett. Nøkler som ikke er aktive, hoppes over.
- `POST …/notifications/dismiss` med `{ key }` avviser. En nøkkel som ikke er aktiv for denne husholdningen og
  brukeren, gir 404 `errors.notification.notFound`.
- Tilstanden lagres i `notification_states` med primærnøkkel `(user_id, household_id, key)` og `ON CONFLICT`. Samme
  varsel kan derfor ikke avvises eller merkes to ganger, heller ikke samtidig.
- Et avvist varsel vises ikke igjen. En ny dato eller en ny måned er en ny nøkkel og gir et nytt varsel.
- Tilstander eldre enn 45 dager slettes når brukeren lagrer en ny tilstand. Et varsel er aktivt i høyst en måned
  (budsjett), så ingenting dukker opp igjen.

### FR-NOTIF-005 Innstillinger
- `GET` / `PUT /me/notification-settings` (bare innlogget, brukeren tas fra sesjonen).

  | Felt | Standard |
  |---|---|
  | `useBy` | på |
  | `bestBefore` | på |
  | `daysBefore` | 1 (0–7, CHECK i databasen) |
  | `budget` | på |
  | `shopping` | på |

- Uten rad brukes standarden. Valideres med samme Zod-skjema i nettleseren og på serveren.
- Ligger under Innstillinger → Varsler.

### FR-NOTIF-006 Hvem ser hva
- Bare nåværende medlemmer ser varsler, og bare for den aktive husholdningen (`householdAccess`, som før).
- Varsler om datoer og budsjett: alle medlemmer, hver med egne innstillinger og egen tilstand. Avviser Ola et varsel,
  ser Kari det fortsatt.
- Varselet om handlelisten: bare de andre, ikke den som la til.
- `notification_states` har en sammensatt fremmednøkkel til `household_members(household_id, user_id)` med
  `ON DELETE CASCADE`. Forlater man en husholdning, blir fjernet eller den slettes, forsvinner tilstanden.

### Nettappen
- Bjelle i toppfeltet (telefon) og i sidemenyen (bred skjerm), med tall. Navnet for skjermlesere er «Varsler, 3 nye».
- `/varsler`: liste med tekst, lenke (varen, budsjettet eller handlelisten) og «Avvis». Avvis-knappen har et
  `aria-label` med navnet. Siden merker varslene som sett når de er vist.
- En `aria-live="polite"`-region sier «2 nye varsler» bare når tallet øker mens appen er åpen.
- Når noe avvises, kommer en toast. Varslene hentes ved fokus og hvert 60. sekund.
- Tomt («Ingen varsler nå»), lasting og feil har egne tilstander.

## Datamodell (migrering `notifications`)

| Endring | Merknad |
|---|---|
| `notification_settings` | `user_id` (PK, CASCADE), `use_by`, `best_before`, `days_before` (CHECK 0–7), `budget`, `shopping`, `updated_at` |
| `notification_states` | `user_id`, `household_id`, `key` (varchar 120), `seen_at`, `dismissed_at?`. PK `(user_id, household_id, key)`. Fremmednøkkel `(household_id, user_id)` → `household_members` med CASCADE. CHECK på nøkkelformatet. |
| `household_members.shopping_seen_at` | `timestamptz`, standard `now()` |

## API

| Metode | Sti | Krever |
|---|---|---|
| GET | `/households/:householdId/waste-stats` | medlem |
| GET | `/households/:householdId/notifications` | medlem |
| POST | `/households/:householdId/notifications/seen` | medlem |
| POST | `/households/:householdId/notifications/dismiss` | medlem |
| POST | `/households/:householdId/shopping-list/seen` | medlem |
| GET / PUT | `/me/notification-settings` | innlogget |

## Sikkerhet og personvern
- `householdAccess` på alle husholdningsrutene (404 for ikke-medlem). IDOR-tester for hvert endepunkt.
- En nøkkel med en annen husholdnings parti-ID er ikke aktiv i egen husholdning og gir 404.
- Varenavn, nøkler og beløp kommer ikke i logger eller feilmeldinger (testet).
- Varsler lagres ikke. Bare nøkler med tidspunkt lagres, i høyst 45 dager. Se kapittel 12.

## Avvik og tillegg under implementeringen

1. **Gammel nøkkel for handlelisten:** Den første versjonen godtok bare nøyaktig den aktive nøkkelen. La noen til en
   linje mens varselsiden var åpen, ga «Avvis» 404. API-testen fant det. Nå godtas en `shopping:`-nøkkel med et
   tidspunkt som ikke er senere enn den nyeste linjen, og «sett»-tidspunktet flyttes bare fram.
2. **Avvise samme varsel to ganger** gir 204, ikke 404. Det er ufarlig og enklere for nettappen.
3. **Toast-regionen het også «Varsler»** (fra fase 1). axe fant to landemerker med samme navn på
   innstillingssiden. Toast-regionen heter nå «Meldinger», så «Varsler» bare betyr varslene.
4. **Tabellen over 12 måneder** har fire kolonner (måned, kasseringer, kjent verdi med «herav anslått» i samme celle,
   ukjent verdi), ikke fem. Da får den plass på 360 px uten at noe skjules for skjermlesere.
5. **Sletting av kjøp og vare** (fra fase 4 og 3) venter ikke lenger på at husholdningens data er hentet på nytt.
   Varselspørringen gjorde den nye hentingen tregere. Det kjøpet eller den varen som var slettet, ga da 404, siden
   viste «Fant ikke», og TanStack droppet meldingen og navigeringen. Playwright fant det på telefon under høy last.
6. **`/svinn` er en ny seksjon i menyen** (ti seksjoner), under «Mer» på telefon.

## Utenfor fasen
E-post og push (FR-AUTH-006, fase 13), varselhistorikk, varsel om medlemmer som kommer og går, svinn i prosent av
utgiftene, statistikk per person, eksport av statistikken.

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-11).
