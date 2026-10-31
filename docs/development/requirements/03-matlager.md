# 03 – Matlager (fase 3)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-21 («godkjent»). Anbefalingene i de seks åpne
spørsmålene gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før implementeringen. Ikke gjennomgått av
Linus Saxe Huseby. Fasen ble startet i samme chat som fase 2, etter Ferdinands ønske.

**Bygger på:** FR-INV-001–008, FR-DASH-001 (delen om matlageret), NFR-SEC-001, NFR-DATA-001 og NFR-UX-001–004 i
[00-kravoversikt.md](00-kravoversikt.md), samt ADR-0006 og ADR-0008.

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Produktkatalog | Navnet er fritekst på varen. `Product` og strekkode kommer i fase 7. Dette avviker fra datamodellen. |
| 2 | Datoer per parti | Én dato per parti, av typen *best før* eller *siste forbruksdag*, eller ingen dato |
| 3 | «Går ut snart» | 3 dager eller mindre, for begge datotyper |
| 4 | Dialoger | Egen `Dialog`-komponent bygd på `<dialog>` |
| 5 | AuditEvent | Droppes. `inventory_events` er historikken. |
| 6 | Fryst mat | Ingen egen logikk og ingen helseråd om frysing |

## Begreper

| Begrep | Betydning |
|---|---|
| **Vare** (`inventory_item`) | Noe husholdningen har, for eksempel «Lettmelk». Har navn, kategori og enhet (g, ml eller stk). |
| **Parti** (`inventory_batch`) | Én fysisk pakke eller kjøp av varen, med egen mengde, eget sted og egen dato. Samme vare kan ha flere partier (FR-INV-002). |
| **Hendelse** (`inventory_event`) | En endring av et parti: lagt til, brukt, kastet, flyttet, justert eller angret. Hendelser blir aldri endret eller slettet, bortsett fra når varen slettes. |
| **Grunnenhet** | Gram, milliliter eller stykk, alltid som heltall (ADR-0006) |

## Krav og akseptansekriterier

### FR-INV-001 Legge til vare
- **Påkrevd:** navn (1–100 tegn), kategori, mengde og enhet, og lagringssted.
- **Valgfritt:** datotype og dato (sammen eller ikke i det hele tatt), pris for partiet (øre) og kjøpsdato.
- **Mengde** skrives med norsk desimalkomma i en visningsenhet:

  | Grunnenhet | Visningsenheter |
  |---|---|
  | g | g, kg |
  | ml | ml, dl, l |
  | stk | stk |

  Mengden lagres som et positivt heltall i grunnenhet. En mengde som ikke blir et helt antall gram eller milliliter,
  avvises (for eksempel `1,2345 kg`).
- Varen og første parti opprettes i én transaksjon, sammen med hendelsen `add`.

### FR-INV-002 Flere partier
- En vare kan få nye partier med egen mengde, eget sted og egen dato.
- Partiene vises sortert etter dato, slik at det som går ut først kommer øverst. Partier uten dato vises sist.

### FR-INV-003 Redigere, flytte og slette
- **Varen:** navn og kategori kan endres. Enheten kan ikke endres etter at varen er opprettet, fordi det ville gjort
  mengdene feil.
- **Partiet:**
  - dato, pris og kjøpsdato kan rettes
  - flytting til et annet sted gir hendelsen `move`
  - retting av mengden gir hendelsen `adjust` med differansen
- **Sletting:** «Slett» fjerner varen eller partiet helt, også historikken. Det er ment for feilregistreringer, og
  krever bekreftelse. Mat som kastes, registreres med «Kast» (FR-INV-007).
- **Lagringssteder:** Hver husholdning får Kjøleskap, Fryser og Skap. Brukeren kan legge til, gi nytt navn til og
  slette steder. Et sted kan bare slettes når det ikke har partier med noe igjen i (409
  `errors.inventory.locationNotEmpty`). Det siste stedet kan ikke slettes (409 `errors.inventory.lastLocation`).
  Tomme partier på stedet slettes sammen med det, mens hendelsene og svinnloggen beholdes (koblingen til partiet
  blir tom). *Regelen om siste sted ble lagt til under implementeringen.*

### FR-INV-004 Søke, filtrere og sortere
- Søket gjelder varenavn. Det skiller ikke mellom store og små bokstaver, og treffer også deler av ord.
- **Filtre:** sted, kategori og status (går ut snart, passert, uten dato, alle).
- **Sortering:** første dato (standard), navn (A–Å, norsk sortering) og sist lagt til.
- Søk, filtre og sortering ligger i URL-en (`?q=&sted=&kategori=&status=&sortering=`), slik at visningen kan deles
  og lastes på nytt. Filtreringen skjer i nettleseren.
- Varer uten partier igjen skjules som standard.

### FR-INV-005 Holdbarhet
- «I dag» regnes i tidssonen Europe/Oslo.
- **Status per parti:**

  | Status | Når |
  |---|---|
  | `passed` | datoen er før i dag |
  | `today` | datoen er i dag |
  | `soon` | 1–3 dager igjen |
  | `ok` | mer enn 3 dager igjen |
  | `none` | ingen dato |

- **Varens status** er den mest alvorlige statusen blant partiene.
- **Ordlyden er forskjellig** for de to datotypene:

  | Status | Siste forbruksdag | Best før |
  |---|---|---|
  | passed | «Siste forbruksdag passert», med råd: «Bør ikke spises. Siste forbruksdag handler om mattrygghet.» | «Best før passert», med råd: «Ofte fortsatt god. Se, lukt og smak.» |
  | today | «Siste forbruksdag i dag» | «Best før i dag» |
  | soon | «Siste forbruksdag om N dager» | «Best før om N dager» |

- Appen anbefaler aldri å spise noe etter siste forbruksdag.
- Status vises med tekst og ikon, ikke bare med farge.
- **Oppsummering øverst i lageret:** antall varer som går ut snart (today og soon), som har passert datoen, og som
  mangler dato. Hvert tall er en lenke som setter filteret.

### FR-INV-006 Forbruk
- Brukeren kan bruke hele partiet eller en del av det (i en visningsenhet).
- Mengden kan ikke bli negativ, heller ikke når to forespørsler kommer samtidig: databasen trekker fra med en
  betingelse, og en CHECK sørger for at mengden er ≥ 0.
- Mer enn det som er igjen gir 409 `errors.inventory.notEnough`.

### FR-INV-007 Kassering
- Brukeren oppgir mengde (helt eller delvis) og årsak:

  | Årsak | Betydning |
  |---|---|
  | `expired` | Gått ut på dato |
  | `spoiled` | Ødelagt eller mugne |
  | `leftovers` | Matrester |
  | `tooMuch` | Kjøpt for mye |
  | `other` | Annet |

- **Verdi:**

  | Type | Når |
  |---|---|
  | `actual` | brukeren skriver inn beløpet |
  | `estimated` | partiet har pris: `round(pris × kassert mengde / opprinnelig mengde)`, regnet med heltall i øre |
  | `unknown` | ingen pris |

- Kasseringen lagres i hendelsen (svinnloggen), som grunnlag for statistikk i fase 11.

### FR-INV-008 Historikk og angre
- Varesiden viser alle hendelser for varen, nyeste først, med hvem som gjorde det og når.
- **Angre:**
  - bare *siste* hendelse for varen kan angres
  - angring gir en ny hendelse av typen `undo`, som reverserer mengden (og stedet ved `move`)
  - en `undo` kan ikke angres
  - går det ikke (for eksempel fordi resultatet ville blitt negativt), svarer API-et 409
  - hendelsen `add` for et parti angres ved at partiet tømmes (mengde 0, skjules). Var det varens eneste parti,
    beholdes varen uten partier. Partiet slettes ikke, slik at historikken henger sammen.

### FR-DASH-001 Forsiden (delen om matlageret)
- Kortet «Går ut snart» viser opptil 5 partier med status `passed`, `today` eller `soon`, i datorekkefølge, med
  lenke til varen.
- Kortet «Kastet denne måneden» viser antall kasseringer og sum av kjent verdi (actual og estimated) i inneværende
  kalendermåned (Europe/Oslo). Kasseringer med ukjent verdi telles, og merkes som «verdi ukjent».
- Budsjett og middagsforslag er fortsatt eksempeldata til fase 4 og 5, og er merket slik.

## Sikkerhet (NFR-SEC-001)
- Alle ruter ligger under `/households/:householdId/` og bruker `requireAuth` og `householdAccess`.
- Alle oppslag på vare, parti og sted filtrerer også på `householdId`. En ID fra en annen husholdning gir 404, og
  ingenting blir endret.
- I databasen har partier og hendelser `household_id`. Felles fremmednøkler (`(item_id, household_id)` og
  `(location_id, household_id)`) gjør det umulig å koble et parti til en vare eller et sted i en annen husholdning.
- Sletting av konto sletter husholdningen og dermed hele lageret (cascade).

## API
Se [api-documentation.md](../api-documentation.md).

## Avvik oppdaget under implementeringen

- **`seq` på hendelser:** Hendelser fikk et løpenummer (`seq`, egen migrering) for at «siste hendelse» skal være
  entydig, også når to hendelser får samme tidsstempel.
- **Filtre på telefon:** Filtrene ligger i en sammenleggbar «Filtrer og sorter». Søkefeltet er alltid synlig.
  Uten dette havnet en velger halvveis bak den faste bunnmenyen (se kapittel 11).

## Utenfor fasen
Strekkode og produktkatalog (fase 7), kobling til kjøp (fase 4), åpnet-dato og holdbarhet etter åpning,
varsler (fase 11) og statistikk over svinn (fase 11).

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-3).
