# 06 – Handleliste (fase 6)

**Status:** Planen ble godkjent av Ferdinand Risan i chat 2026-10-21 («Jeg godkjenner plannen»). Anbefalingene i de
seks åpne spørsmålene gjelder (se under). Spesifikasjonen er skrevet av KI (Claude) før implementeringen. Ikke
gjennomgått av Linus Saxe Huseby.

**Bygger på:** FR-SHOP-001–003, FR-DASH-001 (hurtighandlingen), NFR-SEC-001/002/004, NFR-DATA-002, NFR-UX-001–004
og KURS-03 (antatt) i [00-kravoversikt.md](00-kravoversikt.md), samt ADR-0006, ADR-0007 og ADR-0008.

## Avgjørelser tatt ved godkjenningen

| # | Spørsmål | Avgjørelse |
|---|---|---|
| 1 | Én liste eller flere | Én liste per husholdning. Tabellen `shopping_lists` gjør det mulig å få flere senere. |
| 2 | Samme ingrediens står allerede på listen | Slås sammen med den åpne linjen. Oppskriftens bidrag vises under linjen. |
| 3 | Basisvarer og valgfrie ingredienser | Vises i dialogen, men er ikke krysset av |
| 4 | Forholdet til ADR-0007 | Bare lager, ingen utgift. Partiet får ingen pris og ingen kjøpskobling. Dialogen lenker til «Registrer kjøp». |
| 5 | Linjen etter at den er lagt i lageret | Fjernes fra listen i samme transaksjon |
| 6 | Gruppering etter kategori | Utsatt |

## Begreper

| Begrep | Betydning |
|---|---|
| **Handleliste** (`shopping_list`) | Husholdningens ene liste |
| **Linje** (`shopping_list_item`) | Én ting som skal kjøpes: tekst, valgfri mengde (heltall i g, ml eller stk) og om den er huket av |
| **Åpen linje** | En linje som ikke er huket av |
| **Ingredienskobling** | `ingredient_id` på linjen. Settes når linjen kommer fra en oppskrift, eller når teksten entydig treffer et alias (samme regler som i fase 5). Endres ikke senere. |
| **Oppskriftsbidrag** (`shopping_list_item_recipe`) | Hvilken oppskrift som la til hvor mye på en linje |

## Krav og akseptansekriterier

### FR-SHOP-001 Føre handlelisten for hånd
- **Legge til:** tekst (1–100 tegn) og valgfri mengde med enhet (g/kg, ml/dl/l eller stk, som i matlageret).
  Mengden lagres som et positivt heltall i grunnenhet (ADR-0006).
- **Ingredienskobling:** teksten kobles til en ingrediens når den treffer entydig (fase 5-reglene for aliaser). Står
  det allerede en åpen linje for samme ingrediens, blir den nye linjen likevel lagt til, men **uten** kobling, og
  svaret sier hvilken linje som ligner. Grensesnittet sier da «… står allerede på listen».
- **Dobbel innsending:** skjemaet sender en tilfeldig `clientRequestId`. Kommer den igjen, svarer API-et med linjen
  som ble lagret (200), i stedet for å lage en ny. Unik begrensning på `(household_id, dedupe_key)`.
- **Rette:** tekst og mengde kan rettes, og mengden kan fjernes. Ingredienskoblingen endres ikke.
- **Huke av og fjerne hake:** API-et *setter* `checked` (true eller false). Det byttes aldri, så samme forespørsel to
  ganger gir samme resultat. Å fjerne haken når det allerede står en annen åpen linje for samme ingrediens, gir 409
  `errors.shopping.alreadyOnList`.
- **Fjerne:** én linje, eller alle avhukede på én gang («Fjern avhukede», med bekreftelse).
- **Rekkefølge:** åpne linjer først (eldste øverst), så avhukede (sist avhuket øverst).

### FR-SHOP-002 Manglende ingredienser fra en oppskrift
- Oppskriftssiden har knappen «Legg manglende i handlelisten». Den åpner en dialog med ett forslag per ingrediens:

  | Status (fase 5) | I dialogen |
  |---|---|
  | `missing` | krysset av, med hele mengden (eller uten mengde ved «etter smak») |
  | `notEnough` | krysset av, med det som mangler |
  | `unknownAmount` | ikke krysset av: «Du har noe, men mengden kan ikke sammenlignes» |
  | `staple` | ikke krysset av: «Basisvare – sjekk at du har» |
  | valgfri | ikke krysset av, merket «valgfri» |
  | `enough` | vises ikke |

  Står ingrediensen allerede på listen (åpen eller avhuket), er forslaget ikke krysset av og merket «Står på listen».
- Brukeren kan krysse av og rette mengden før hun eller han legger til. Mengden er i ingrediensens grunnenhet.
- **Sammenslåing** (`mergeQuantity`, ren funksjon):
  - Finnes en åpen linje for ingrediensen, får den oppskriftsbidraget. Har begge mengde i samme enhet, legges
    mengdene sammen. Mangler den åpne linjen mengde, eller har den en annen enhet, beholdes mengden som den er.
    Bidraget vises uansett under linjen («Pannekaker: 500 ml»).
  - Er oppskriften allerede registrert på linjen, endres ingenting (samme oppskrift telles aldri to ganger).
  - Ellers lages en ny linje med ingrediensens navn som tekst.
- **Server:** oppskriften må finnes (404), og hver ingrediens må høre til oppskriften (400 med feltfeil). Listen
  låses (`FOR UPDATE`) mens sammenslåingen skjer. En delvis unik indeks tillater bare én åpen linje per ingrediens.
- Svaret sier hvor mange linjer som ble nye, slått sammen og hoppet over.

### FR-SHOP-003 Avhukede varer til matlageret
- Knappen «Legg i matlageret» åpner en dialog med én del per avhuket linje: vare (eksisterende eller ny), mengde, sted
  og valgfri dato (best før eller siste forbruksdag).
  - **Eksisterende vare:** varer som er koblet til samme ingrediens, foreslås først. Mengden er i varens enhet.
  - **Ny vare:** navnet er linjens tekst, kategorien er ingrediensens kategori (eller «Annet»), og enheten velges.
  - Mengden fylles ut fra linjen når enheten passer.
- **Kobling til ingrediensen:** en ny vare fra en linje med ingredienskobling får `ingredient_match = manual` og
  linjens `ingredient_id`, men bare når navnet ikke allerede treffer samme ingrediens automatisk. Da matcher varen
  oppskriften igjen.
- **Én databasetransaksjon:**
  1. Linjene slettes med en betingelse (`household_id`, avhuket). Blir det slettet færre linjer enn sendt, avbrytes
     alt med 409 `errors.shopping.changedMeanwhile`. En dobbel eller samtidig innsending gir derfor aldri doble
     partier.
  2. Nye varer opprettes.
  3. Partiene lages med `insertBatchWithEvent` (hendelsen `add`), uten pris og uten kjøpskobling (avgjørelse 4).
- Steder og varer kontrolleres mot husholdningen (400 med feltfeil).
- Etterpå invalideres husholdningens data, så oppskriftene rangeres på nytt.
- Dialogen sier at varene ikke er registrert som et kjøp, og lenker til «Registrer kjøp».

### Mobil først og KURS-03
- Ingen horisontal rulling på 360 px. Hver rad er minst 44 px høy, og hele raden er etiketten til avkrysningsboksen.
- Avhukingen oppdateres optimistisk (TanStack Query `onMutate`) og rulles tilbake ved feil, med en melding.
- **DOM-håndtering som vises og forklares (KURS-03, antatt):**
  - én delegert `change`-lytter på listen (`data-item-id`) i stedet for én per rad
  - fokus flyttes til neste rad (eller hurtigfeltet) når en rad fjernes
  - et `aria-live`-område melder «Lagt til», «Huket av» og «Fjernet»
  - hurtigfeltet: Enter legger til, og fokus blir værende i feltet
- Tilstander for lasting, feil og tom liste.

### FR-DASH-001 Forsiden (hurtighandlingen)
- Hurtighandlingen «Handleliste» viser antall åpne linjer.

## Sikkerhet (NFR-SEC-001/002/004)
- Alle ruter ligger under `/households/:householdId/shopping-list` med `requireAuth` og `householdAccess`. Linjer,
  varer og steder slås alltid opp med `householdId`. En ID fra en annen husholdning gir 404 eller 400, og ingenting
  endres.
- Sammensatte fremmednøkler `(list_id, household_id)` på linjer og `(item_id, household_id)` på bidrag.
- `recipeId` og `ingredientId` kontrolleres mot de globale tabellene, og ingrediensen mot oppskriften.
- Linjetekst kommer aldri i feilmeldinger eller logger. Sletting av kontoen sletter listen (cascade).
- **Frødata:** seed-skriptet fjerner ikke ingredienser som en handlelistelinje bruker (`RESTRICT` på fremmednøkkelen).
  En oppskrift som fjernes, tar bidragene med seg (cascade), mens linjene blir stående.

## API
Se [api-documentation.md](../api-documentation.md).

## Avvik og tillegg under implementeringen

- **Én enhet for ny vare:** I dialogen «Legg i matlageret» velger brukeren bare enheten ved mengden (g, kg, ml, dl,
  l eller stk). Varens grunnenhet følger av den («kg» gir gram). Først var det to felt som begge het «Enhet», og det
  var forvirrende på skjermbildene.
- **Bidrag uten gjentatt mengde:** Har én oppskrift bedt om nøyaktig linjens mengde, står det «Fra Pannekaker» under
  linjen i stedet for «Pannekaker: 150 g» rett under «150 g».
- **Ingredienslisten** (`GET /ingredients`) har nå `categoryKey`, slik at dialogen kan foreslå kategori for en ny
  vare.
- **Avkrysningsboksene er ukontrollerte** og bygges på nytt (ny nøkkel) når avhukingen rulles tilbake. Uten det kunne
  en boks vise hake etter en avvist forespørsel.
- **Hurtigfeltet på telefon:** mengde og enhet står i to kolonner, og «Legg til» har full bredde under. Med tre
  kolonner brøt «Mengde (valgfritt)» over to linjer på 360 px.

## Utenfor fasen
Flere lister, deling i sanntid mellom medlemmer (fase 10), gruppering etter kategori eller butikkavdeling, priser og
registrering som kjøp fra listen, behov fra måltidsplan (fase 9), strekkode i butikken (fase 7).

## Sporbarhet til tester
Se [kapittel 11](../../academic/11-testing-og-testresultater.md#testtyper-og-sporbarhet-fase-6).
