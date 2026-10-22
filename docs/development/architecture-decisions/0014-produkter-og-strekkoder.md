# ADR-0014: Produkter fra Open Food Facts som globalt mellomlager, og husholdningens egne strekkoder

**Status:** Akseptert 2026-10-22 — foreslått av KI (Claude) i planen for fase 7, godkjent av Ferdinand Risan i chat
(«godkjent»). Ikke gjennomgått av Linus Saxe Huseby.

## Kontekst
Fase 3 utsatte `Product` og `ProductBarcode`, så en vare har et fritt navn. I fase 7 skal en skannet strekkode fylle
ut skjemaet fra Open Food Facts (OFF), og en ukjent strekkode skal huskes for husholdningen. Oppskriftsmatchingen
fra fase 5 kobler varer til ingredienser via navnet. OFF tillater bare 15 oppslag i minuttet per IP.

## Beslutning
- **`products`** er et globalt mellomlager for det OFF svarte: GTIN (unik), navn, merke, pakningsstørrelse i
  grunnenhet, enhet, kategori og tidspunkt. **`product_lookup_misses`** husker GTIN-er OFF ikke kjente. Ingen av
  tabellene har `household_id` eller noe om brukere. Treff gjelder i 30 dager, «fant ingenting» i 24 timer.
- **`household_barcodes`** (`household_id`, `gtin`) er det husholdningen bekreftet sist: navn, kategori, enhet,
  mengde, ingrediensvalg, sted, datotype og varen den ble lagt på. Den vinner over OFF og er det eneste stedet en
  ukjent strekkode huskes.
- **Vare → ingrediens** skjer som før: navnet brukeren bekrefter, kobles automatisk med aliasene fra fase 5, eller
  brukeren velger. Det finnes ingen global kobling fra produkt til ingrediens.
- `ProductBarcode` fra datamodellen er ikke laget. OFF har én kode per produkt, og en egen tabell ville bare gitt
  verdi hvis vi selv slo sammen produkter med flere koder.
- `inventory_batches` får `dedupe_key` (unik per husholdning), slik at dobbel innsending gir ett parti.

## Alternativer
- **Strekkoden direkte på varen:** enklere, men det appen husker forsvinner når varen slettes, og en rettet
  OFF-oppføring kan ikke gjenbrukes uten en vare.
- **Produkter per husholdning, kopiert fra OFF:** samme OFF-data lagres mange ganger, og grensen mot OFF nås raskere.
- **Global kobling produkt → ingrediens:** krever at noen kontrollerer hver kobling. KI ville måttet gjette.

## Konsekvenser
- Et oppslag som allerede er gjort, koster ingenting mot OFF, uansett husholdning.
- Husholdningens svar kan inneholde navn brukeren har skrevet, og slettes med husholdningen (cascade).
- Mellomlageret er et utdrag av OFF-databasen og er under ODbL. Det brukes bare internt (se
  [integrations/open-food-facts.md](../integrations/open-food-facts.md)).
- Sletting av en vare eller et sted må tømme koblingen i `household_barcodes` først (sammensatt fremmednøkkel med
  `NoAction`, som `purchase_line_id`).
