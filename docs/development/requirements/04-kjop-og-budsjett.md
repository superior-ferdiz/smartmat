# 04 – Kjøp og budsjett (fase 4)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-21 («Godkjennt du kan committe jeg har gått igjennom
alt»). Anbefalingene i de åtte åpne spørsmålene gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før
implementeringen. Ikke gjennomgått av Linus Saxe Huseby.

**Bygger på:** FR-BUD-001–005, FR-DASH-001 (delen om budsjett), NFR-DATA-001/002, NFR-SEC-001/002/004 og
NFR-UX-001–004 i [00-kravoversikt.md](00-kravoversikt.md), samt ADR-0006, ADR-0007 og ADR-0008.

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Kjøp med bare totalsum | Teller som brukt og vises som «Ikke fordelt» i oversikten per kategori |
| 2 | Sletting av kjøp med lagerpartier | Urørte partier fjernes sammen med kjøpet, med mindre brukeren krysser av for å beholde dem. Partier som er brukt, kastet, flyttet eller justert, blir alltid værende. Samme regel når en linje fjernes ved retting. |
| 3 | Ikke-mat (såpe, pant osv.) | Registreres, men teller ikke mot matbudsjettet. Vises som egen sum «Ikke mat». |
| 4 | Endring av budsjettet | Gjelder fra inneværende måned. Tidligere måneder beholder beløpet de hadde. |
| 5 | Rabatt og pant | Ingen negative linjer. Brukeren fører nettobeløpet. |
| 6 | Kjøpsdato | Ikke frem i tid (norsk tid). Tidligst 2000-01-01. |
| 7 | Månedsvelger | Oversikten kan bla til andre måneder |
| 8 | Budsjett per kategori | Utsatt. Ett matbudsjett per husholdning. |

## Begreper

| Begrep | Betydning |
|---|---|
| **Kjøp** (`purchase`) | Én handletur: butikk (valgfritt), dato og totalsum. Eneste kilde til utgifter (ADR-0007). |
| **Kjøpslinje** (`purchase_line`) | Én ting i kjøpet: beskrivelse, type (mat eller ikke mat), kategori (for mat) og beløp |
| **Matbudsjett** (`food_budget`) | Beløpet husholdningen vil bruke på mat per måned, gyldig fra en måned og fremover |
| **Brukt** | Summen av matlinjer og kjøp med bare totalsum i måneden. Ikke-mat er ikke med. |
| **Urørt parti** | Et parti fra et kjøp der mengden er som da det ble lagt inn, og der det ikke finnes andre hendelser enn `add` |

## Krav og akseptansekriterier

### FR-BUD-001 Registrere kjøp manuelt
- **Påkrevd:** dato. **Valgfritt:** butikk (1–100 tegn, tom tekst lagres som ingen butikk).
- Kjøpet registreres **enten** med linjer **eller** med bare totalsum, aldri begge:
  - **Linjer:** 1–100 linjer. Hver linje har beskrivelse (1–100 tegn), type `food` eller `nonFood`, kategori (påkrevd
    for mat, ikke tillatt for ikke-mat) og beløp. Totalsummen regnes av serveren som summen av linjene. En totalsum
    fra klienten avvises.
  - **Bare totalsum:** beløpet oppgis, og kjøpet har ingen linjer.
- **Beløp** er hele øre (ADR-0006), skrives med norsk desimalkomma i skjemaet og sendes som heltall.
  Grenser: en linje 0–100 000 kr, et kjøp 0–1 000 000 kr (også summen av linjene).
- Datoen kan ikke være senere enn dagens dato i norsk tid (`validation.purchase.dateInFuture`), og ikke før 2000.
- **Dobbel innsending (NFR-DATA-002, manuell del):** Skjemaet sender en tilfeldig `clientRequestId` (UUID). Kommer
  samme ID igjen fra samme husholdning, svarer API-et med det eksisterende kjøpet (200) i stedet for å lage et nytt.
  Databasen har en unik begrensning på `(household_id, dedupe_key)`, så to samtidige forespørsler kan heller ikke gi
  to kjøp. Duplikater ved kvitteringsimport hører til fase 8.
- Valuta lagres (`NOK`, CHECK) for senere utvidelse.

### FR-BUD-002 Fra kjøp til matlager
- En matlinje kan få «Legg i matlageret» med mengde (grunnenhet, som i fase 3), sted og valgfri dato
  (best før eller siste forbruksdag).
- Linjen legges enten inn som et nytt parti på en **eksisterende vare** (valgt fra listen, samme husholdning), eller
  som en **ny vare** med linjens beskrivelse som navn, linjens kategori og valgt enhet (g, ml eller stk).
- Partiet får prisen fra linjen, kjøpsdatoen fra kjøpet, kobling til linjen og hendelsen `add`.
- **Alt i én databasetransaksjon (ADR-0007):** kjøp, linjer, nye varer, partier og hendelser. Feiler noe (for
  eksempel et sted som ikke finnes i husholdningen), lagres ingenting.
- Ikke-mat kan ikke legges i matlageret.
- Varesiden viser «Fra kjøp» med lenke til kjøpet for partier som kom fra et kjøp.

### FR-BUD-003 Månedlig matbudsjett
- Brukeren setter ett beløp per måned (1 kr–1 000 000 kr) eller fjerner budsjettet.
- Endringen gjelder fra inneværende måned (norsk tid) og fremover. Tidligere måneder beholder beløpet de hadde
  (`valid_from`). For en måned brukes raden med senest `valid_from` som ikke er etter måneden.

### FR-BUD-004 Oversikt over måneden
- Viser for valgt måned (standard: inneværende måned i norsk tid):

  | Tall | Regel |
  |---|---|
  | Budsjett | Gjeldende budsjett for måneden, eller «ikke satt» |
  | Brukt | Matlinjer + kjøp med bare totalsum |
  | Gjenstående | Budsjett − brukt. Kan være negativt og vises da som «over budsjett». |
  | Andel brukt | `floor(brukt × 100 / budsjett)` i hele prosent, regnet med heltall |
  | Per kategori | Sum per kategori, største først, pluss «Ikke fordelt» (kjøp med bare totalsum) |
  | Ikke mat | Sum av ikke-mat-linjer, vist for seg og ikke med i «brukt» |

- Et kjøp hører til måneden for kjøpsdatoen. Kjøpsdatoen er en kalenderdato, så midnatt og sommertid kan ikke
  flytte et kjøp til en annen måned.
- **Kontrollsum:** brukt + ikke mat = summen av `total_ore` for månedens kjøp (testes).
- Oversikten viser månedens kjøp, nyeste dato først, og kan bla til forrige og neste måned.
- Søylene per kategori er pynt. Beløpene står alltid som tekst.

### FR-BUD-005 Rette og slette
- **Retting:** Hele kjøpet sendes på nytt (butikk, dato, linjer eller totalsum).
  - Linjer med kjent ID oppdateres, linjer som mangler, slettes, og nye linjer opprettes (og kan legges i lageret).
    En linje-ID som ikke hører til kjøpet, gir 400.
  - Kjøpet kan bytte mellom linjer og bare totalsum.
  - **Koblede partier:** Nytt beløp oppdaterer partiets pris, slik at senere kasseringer får riktig estimat.
    Kasseringer som allerede er registrert, endres ikke. Ny dato oppdaterer partiets kjøpsdato. Blir linjen ikke-mat,
    beholdes partiet, men koblingen fjernes. Mengder endres aldri fra kjøpet.
- **Sletting** krever bekreftelse. Dialogen viser hvor mange partier som kom fra kjøpet.
- **Partier når et kjøp eller en linje slettes** (avgjørelse 2):
  - urørte partier slettes (med `add`-hendelsen), med mindre brukeren har valgt å beholde dem
  - alle andre partier beholdes med pris og historikk, og koblingen til kjøpet blir tom
  - en vare som da står uten partier og uten hendelser, slettes også
  - partiene låses (`FOR UPDATE`) før sjekken, så et samtidig forbruk ikke kan gå tapt
- Svaret sier hvor mange partier som ble fjernet og hvor mange som ble beholdt.
- Alle summer regnes fra kjøpene ved hver visning, så retting og sletting gir riktige summer uten egen oppdatering.
- **Samtidighet:** Ingen versjonskontroll. Retter to medlemmer samme kjøp samtidig, vinner den siste lagringen.
  Husholdninger har ett medlem til fase 10.
- Endrer brukeren prisen på et parti i matlageret, endres ikke kjøpet. Kjøpet er kilden til utgifter.

### FR-DASH-001 Forsiden (budsjettdelen)
- Budsjettkortet viser brukt, gjenstående og budsjett for inneværende måned fra API-et, med fremdriftslinje og tekst.
- Uten budsjett viser kortet brukt og en lenke «Sett budsjett».
- Merket «eksempeldata» fjernes fra budsjettkortet. Middagsforslaget er fortsatt eksempeldata til fase 5.
- Hurtighandlingen «Registrer kjøp» går til skjemaet for nytt kjøp.

## Sikkerhet (NFR-SEC-001/002/004)
- Alle ruter ligger under `/households/:householdId/` og bruker `requireAuth` og `householdAccess`.
- Kjøp, linjer og budsjett slås alltid opp med `householdId`. Et kjøp fra en annen husholdning gir 404, og ingenting
  endres.
- `itemId` og `locationId` i en linje kontrolleres mot husholdningen (400 med feltfeil). Sammensatte fremmednøkler
  er en ekstra sperre: `(purchase_id, household_id)` på linjer og `(purchase_line_id, household_id)` på partier.
- Zod validerer alt på serveren. CHECK-begrensninger i databasen: beløpsgrenser, `NOK`, at mat har kategori og
  ikke-mat ikke har, og at `valid_from` er den første i måneden.
- Butikknavn og beskrivelser kommer aldri i feilmeldinger eller logger.
- Sletting av kontoen sletter husholdningen og dermed kjøp og budsjett (cascade).

## API
Se [api-documentation.md](../api-documentation.md).

## Avvik og tillegg under implementeringen

- **Ny feilkode** `errors.purchase.changedMeanwhile` (409): en vare eller et sted ble slettet mellom kontrollen og
  lagringen. Lagerets kode («Partiet ble endret») hadde feil ordlyd for kjøp.
- **Varesiden** viser «Fra kjøp» med lenke for partier fra et kjøp (`purchaseId` på partiet i API-et).
- **Kategori på kjøpslinjer** er `RESTRICT` ved sletting av kategori, ikke `SET NULL` som Prisma foreslo, fordi
  mat alltid skal ha kategori.

## Utenfor fasen
Kvitterings-OCR og duplikatsjekk ved import (fase 8), strekkode på linjer (fase 7), budsjett per kategori, rabatt- og
pantlinjer, flere valutaer, versjonskontroll ved samtidig retting (fase 10), statistikk over tid (fase 11).

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-4).
