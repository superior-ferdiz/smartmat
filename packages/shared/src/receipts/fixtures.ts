/*
 * MADE-UP receipt texts for the parser tests (spec 08). They copy the *layout* of the chains' receipts as described
 * in docs/development/kjedeformater.md – where the quantity line goes, how deposit and totals are printed – but every
 * item, amount, number, store and date is invented. Real receipts are never used in tests.
 *
 * The "noisy" texts imitate what Tesseract did in the pilot: an amount sliding onto the next line, a garbled word,
 * a missing logo. Each line is "confidence | text".
 */

const lines = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((row) => {
      const [confidence, ...rest] = row.split('|');
      return { confidence: Number(confidence), text: rest.join('|').trim() };
    });

/** Coop layout (Extra): decimal point, quantity under the item, PANT as its own line, "Totalt (N Artikler)". */
export const COOP_RECEIPT = lines(`
90 | EXTRA
92 | Fiktivby
91 | Åpent 7 - 23
90 | Telefon 00 00 00 00
88 | Fiktiv Handel AS
90 | Org.nr 999 999 999 MVA Foretaksregisteret
91 | Butikk 0000-1, Kasserer 1111
93 | Salgskvittering 424242 03.02.2026 17:05
94 | BANAN KG 23.92
92 | 1.196 kg 20.00 kr/kg
95 | GULROT 1KG 19.90
94 | YOGHURT NATURELL 4X 59.60
93 | Antall: 4 stk 14.90 kr/stk
95 | BRUS SITRON 0.5L 22.90
96 | PANT 2.00
95 | PLASTPOSE 4.00
95 | Totalt (8 Artikler) 132.32
96 | Bank: 132.32
93 | Herav
93 | Dagligvarer 132.32
92 | Øvrige varer 0.00
90 | 03.02.2026 17:06:10
89 | Clerk #: 1111
88 | Terminal: TEST0001
87 | xxxxxxxxxxxx0000-01
88 | AID: A0000000000000
90 | Totalbeløp: NOK 132,32
89 | 00 Godkjent
88 | Authorization: 000000
91 | MVA-grunnlag MVA-% MVA Sum
90 | 2.00 0% 0.00 2.00
91 | 109.84 15% 16.48 126.32
90 | 3.20 25% 0.80 4.00
93 | Takk for besøket, velkommen tilbake!
`);

/** NorgesGruppen layout (Kiwi): decimal comma, VAT rate on each line, "+ Pant", "Sum N varer", dd.mm.yy. */
export const NG_RECEIPT = lines(`
92 | Salgskvittering
91 | KIWI 000 Fiktivby
90 | NG KIWI FIKTIV REGION AS
91 | Foretaksregisteret
90 | ORG.NR. 999 999 999 MVA
91 | TLF: 00 00 00 00
92 | 11.03.26 09:41 Kasse:001
91 | Kvitt:123456 OperNr:001
90 | Serienr.:000000 Id:000000-001
88 | ----------------------------------------
94 | KNEKKEBRØD GROVT 15% 32,90
95 | MINERALVANN 1,5L 15% 19,90
93 | + Pant 0% 3,00
92 | KAFFEFILTER 25% 24,90
94 | OST GULOST 1KG 15% 109,00
88 | ----------------------------------------
93 | Sum 4 varer 189,70
90 | BANK 189,70
91 | Mva% Grunnlag Mva Totalt
90 | 0,00 3,00 0,00 3,00
90 | 15,00 140,70 21,10 161,80
90 | 25,00 19,92 4,98 24,90
91 | SUM 163,62 26,08 189,70
89 | Totalbeløp: NOK 189,70
`);

/**
 * Coop layout as Tesseract read a crumpled photo: no logo, a garbled total line, an amount on its own line, an
 * amount slid onto the "Antall" line, and a misread amount the count × unit price can correct.
 */
export const NOISY_COOP_RECEIPT = lines(`
40 | X%
61 | Fiktiv Handel AS
55 | Salgskvitter ing 777777 05.04.2026 12:30
92 | KNEKKEBRØD GROVT
61 | 34.90
91 | TOMATER 2 POS
88 | Antall: 2 stk 18.50 kr/stk 37.00
89 | SJOKOLADE 200G 36.09
90 | Antall: 2 stk 18.00 kr/stk
93 | PANT
87 | Antall: 2 stk 3.00 kr/stk 6.00
95 | EPLEJUICE 1L 29.90
65 | Tota1t (6 Art1kler) AR
50 | Bank AA
54 | VSilbeløp: NOK 143,80
`);

/** A made-up plain layout for the generic rules: "2 x 24,90", a discount line and a negative amount. */
export const GENERIC_RECEIPT = lines(`
90 | BUTIKKEN FIKTIV
90 | Dato 07.05.2026 kl 10:15
92 | SPAGHETTI 500G 2 x 14,90 29,80
91 | KAMPANJE SPAGHETTI -5,00
93 | KYLLINGFILET 400G 79,90
92 | AGURK 12,50
91 | AGURK RABATT 2,50
93 | SUM 114,70
`);

/** A Coop receipt with a fruit called "KIWI": the chain is Coop's, not Kiwi. */
export const COOP_WITH_KIWI_FRUIT = lines(`
90 | COOP EXTRA
93 | Salgskvittering 111111 01.06.2026 08:00
92 | KIWI GRØNN STK 12.00
91 | Antall: 3 stk 4.00 kr/stk
93 | Totalt (3 Artikler) 12.00
`);

/**
 * NorgesGruppen layout as Tesseract read it in the pilot: junk from the table at the left edge, a space inside
 * amounts, "O%" and "Part", a garbled "Sum N varer" and "Totalbeløp". Items and numbers are made up.
 */
export const NOISY_NG_RECEIPT = lines(`
31 | Sa1gskvitter ing
86 | KIWI 000 Fiktivby
80 | NN ORG.NR. 999 999 999 MVA
55 | På 12.08.26 18:02 Kasse:003
41 | S Kvitt:654321 OperNr:009
32 | Kå Serienr| :000001 Id:000000-003
78 | HÅ HAVREGRYN 1KG 157 24, 90
64 | HÅ + Part O% 2,00
63 | Fy SMÅKAKER 15% 39,90
77 | 2! Em 2 varer 66, 80
78 | PÅ BANK 66,80
62 | Totalbelør: Rå 66,80
`);

/**
 * Coop layout with two more pilot habits: an amount misread as a time ("22:00") on an item line near the top,
 * and a digit of junk after the total amount ("41,30 1"). Items and numbers are made up.
 */
export const NOISY_COOP_TIME_RECEIPT = lines(`
70 | Fiktiv Handel AS
55 | Butikk 0000-2, Kasserer 2222
60 | Sa | gskv 1nN9 000000 1 AA
92 | RISGRYN 1KG
85 | HAVREMELK 1L 22:00
90 | 19.40
91 | KANEL 21.90
66 | Tota1t (3 Artikler) [41.30
35 | ee Bank: 41. 30
53 | ØG Totalbeløp: NOK 41,30 1
`);

/** A plain "COOP" header (the most general Coop pattern, checked last) with a fruit called "KIWI" below it. */
export const COOP_PLAIN_WITH_KIWI_FRUIT = lines(`
90 | COOP FIKTIVBY
93 | Salgskvittering 222222 02.06.2026 09:00
92 | KIWI GRØNN STK 8.00
91 | Antall: 2 stk 4.00 kr/stk
93 | Totalt (2 Artikler) 8.00
`);
