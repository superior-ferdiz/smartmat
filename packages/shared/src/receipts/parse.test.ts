import { describe, expect, it } from 'vitest';
import { detectChain, detectFormat } from './chains';
import {
  COOP_PLAIN_WITH_KIWI_FRUIT,
  COOP_RECEIPT,
  COOP_WITH_KIWI_FRUIT,
  GENERIC_RECEIPT,
  NG_RECEIPT,
  NOISY_COOP_RECEIPT,
  NOISY_COOP_TIME_RECEIPT,
  NOISY_NG_RECEIPT,
} from './fixtures';
import { cleanOcrLine, findAmounts, parseReceiptText, type OcrInputLine } from './parse';
import { isPaymentLine, withoutPaymentLines } from './redact';

// All receipt texts here are made up (fixtures.ts). Spec 08 FR-RCPT-004.

describe('FR-RCPT-004 amounts', () => {
  it('reads point and comma, a leading or trailing minus, and not parts of longer numbers', () => {
    expect(findAmounts('A 151.38 B 24,90').map((a) => a.ore)).toEqual([15138, 2490]);
    expect(findAmounts('-5,00 og 2,50-').map((a) => a.ore)).toEqual([-500, -250]);
    expect(findAmounts('0.946 kg 984.981.384 03.02.2026').map((a) => a.ore)).toEqual([]);
  });
});

describe('FR-RCPT-004 Coop layout (fictional Extra receipt)', () => {
  const parsed = parseReceiptText(COOP_RECEIPT);

  it('finds chain, format, date, time, receipt number, total and article count', () => {
    expect(parsed).toMatchObject({
      chain: 'extra',
      format: 'coop',
      storeName: 'Extra',
      date: '2026-02-03',
      time: '17:05',
      receiptNo: '424242',
      totalOre: 13232,
      linesSumOre: 13232,
      sumMatches: true,
      articleCount: 8,
    });
  });

  it('reads every line with its amount, weight and count, and nothing from the payment part', () => {
    expect(parsed.lines.map((l) => [l.description, l.amountOre])).toEqual([
      ['BANAN KG', 2392],
      ['GULROT 1KG', 1990],
      ['YOGHURT NATURELL 4X', 5960],
      ['BRUS SITRON 0.5L', 2290],
      ['PANT', 200],
      ['PLASTPOSE', 400],
    ]);
    expect(parsed.lines[0]).toMatchObject({ weightG: 1196, unitPriceOre: 2000, count: null });
    expect(parsed.lines[2]).toMatchObject({ count: 4, unitPriceOre: 1490 });
    expect(parsed.lines.every((l) => !l.uncertain)).toBe(true);
  });

  it('suggests deposit and shopping bags as non-food, the rest as food', () => {
    expect(parsed.lines.map((l) => [l.kind, l.suggestedKind])).toEqual([
      ['item', 'food'],
      ['item', 'food'],
      ['item', 'food'],
      ['item', 'food'],
      ['deposit', 'nonFood'],
      ['item', 'nonFood'],
    ]);
  });
});

describe('FR-RCPT-004 NorgesGruppen layout (fictional Kiwi receipt)', () => {
  const parsed = parseReceiptText(NG_RECEIPT);

  it('reads the two-digit year, "Kvitt:", the VAT column and "+ Pant"', () => {
    expect(parsed).toMatchObject({
      chain: 'kiwi',
      format: 'ng',
      date: '2026-03-11',
      time: '09:41',
      receiptNo: '123456',
      totalOre: 18970,
      sumMatches: true,
      articleCount: 4,
    });
    expect(
      parsed.lines.map((l) => [l.description, l.amountOre, l.vatRate, l.kind, l.suggestedKind]),
    ).toEqual([
      ['KNEKKEBRØD GROVT', 3290, 15, 'item', 'food'],
      ['MINERALVANN 1,5L', 1990, 15, 'item', 'food'],
      ['+ Pant', 300, 0, 'deposit', 'nonFood'],
      ['KAFFEFILTER', 2490, 25, 'item', 'nonFood'],
      ['OST GULOST 1KG', 10900, 15, 'item', 'food'],
    ]);
  });
});

describe('FR-RCPT-004 a noisy reading (as in the pilot)', () => {
  const parsed = parseReceiptText(NOISY_COOP_RECEIPT);

  it('still finds date, time and total, and knows the layout without the logo', () => {
    expect(parsed).toMatchObject({
      chain: null,
      format: 'coop',
      storeName: null,
      date: '2026-04-05',
      time: '12:30',
      receiptNo: null,
      totalOre: 14380,
      articleCount: 6,
    });
  });

  it('takes an amount from the next line or from the quantity line, and corrects a misread amount by count × price', () => {
    expect(parsed.lines.map((l) => [l.description, l.amountOre])).toEqual([
      ['KNEKKEBRØD GROVT', 3490],
      ['TOMATER 2 POS', 3700],
      ['SJOKOLADE 200G', 3600],
      ['PANT', 600],
      ['EPLEJUICE 1L', 2990],
    ]);
    expect(parsed.sumMatches).toBe(true);
  });

  it('flags the lines it had to guess at', () => {
    const flags = Object.fromEntries(parsed.lines.map((l) => [l.description, l.flags]));
    expect(flags['KNEKKEBRØD GROVT']).toEqual(['lowConfidence']);
    expect(flags['SJOKOLADE 200G']).toEqual(['quantityMismatch']);
    expect(flags['TOMATER 2 POS']).toEqual([]);
    expect(parsed.lines.find((l) => l.description === 'SJOKOLADE 200G')?.uncertain).toBe(true);
    expect(parsed.lines.find((l) => l.description === 'EPLEJUICE 1L')?.uncertain).toBe(false);
  });
});

describe('FR-RCPT-004 discounts and "2 x 14,90" (fictional generic layout)', () => {
  const parsed = parseReceiptText(GENERIC_RECEIPT);

  it('subtracts a discount from the line above (net amounts, no negative lines)', () => {
    expect(parsed.lines.map((l) => [l.description, l.amountOre, l.discountOre])).toEqual([
      ['SPAGHETTI 500G', 2480, 500],
      ['KYLLINGFILET 400G', 7990, 0],
      ['AGURK', 1000, 250],
    ]);
    expect(parsed.lines[0]).toMatchObject({
      count: 2,
      unitPriceOre: 1490,
      flags: ['discountApplied'],
    });
    expect(parsed.lines[0]?.uncertain).toBe(false);
    expect(parsed).toMatchObject({
      totalOre: 11470,
      sumMatches: true,
      date: '2026-05-07',
      time: '10:15',
    });
    expect(parsed.lines.every((l) => (l.amountOre ?? 0) >= 0)).toBe(true);
  });

  it('ignores a discount larger than the line it would apply to', () => {
    const p = parseReceiptText([
      { text: 'SALT 9,90', confidence: 90 },
      { text: 'RABATT -20,00', confidence: 90 },
      { text: 'SUM 9,90', confidence: 90 },
    ]);
    expect(p.lines).toEqual([
      expect.objectContaining({ description: 'SALT', amountOre: 990, discountOre: 0 }),
    ]);
  });
});

describe('FR-RCPT-004 chain detection', () => {
  it('only looks at the header: a fruit called KIWI on a Coop receipt is not the Kiwi chain', () => {
    const parsed = parseReceiptText(COOP_WITH_KIWI_FRUIT);
    expect(parsed.chain).toBe('extra');
    expect(parsed.lines).toEqual([
      expect.objectContaining({ description: 'KIWI GRØNN STK', amountOre: 1200, count: 3 }),
    ]);
  });

  it('also when the header only says COOP (checked after KIWI): the fruit does not decide the chain', () => {
    const parsed = parseReceiptText(COOP_PLAIN_WITH_KIWI_FRUIT);
    expect(parsed.chain).toBe('coop');
    expect(parsed.format).toBe('coop');
    expect(parsed.lines[0]).toMatchObject({ description: 'KIWI GRØNN STK', amountOre: 800 });
  });

  it.each([
    ['REMA 1000', 'rema', 'rema'],
    ['COOP PRIX FIKTIVBY', 'coopPrix', 'coop'],
    ['Coop Mega', 'coopMega', 'coop'],
    ['MENY FIKTIV', 'meny', 'ng'],
    ['Joker Fiktiv', 'joker', 'ng'],
    ['Coop Fiktiv', 'coop', 'coop'],
  ])('"%s" is %s (%s layout)', (header, chain, format) => {
    expect(detectChain([header])).toBe(chain);
    expect(detectFormat(detectChain([header]), [])).toBe(format);
  });

  it('without a chain, the layout comes from clues, else generic', () => {
    expect(detectFormat(null, ['Sum 3 varer 12,00'])).toBe('ng');
    expect(detectFormat(null, ['Totalt (2 Artikler) 5.00'])).toBe('coop');
    expect(detectFormat(null, ['MELK 20,00'])).toBe('generic');
  });
});

describe('FR-RCPT-004 edge cases', () => {
  const p = (rows: string[], confidence = 90): OcrInputLine[] =>
    rows.map((text) => ({ text, confidence }));

  it('empty or unreadable text gives no lines and no total', () => {
    expect(parseReceiptText([])).toMatchObject({
      lines: [],
      totalOre: null,
      sumMatches: false,
      date: null,
    });
    expect(parseReceiptText(p(['#%&', '...']))).toMatchObject({ lines: [], totalOre: null });
  });

  it('a line without an amount is kept and flagged noAmount', () => {
    const parsed = parseReceiptText(p(['MELK 20,00', 'SMØR', 'BRØD 30,00', 'SUM 50,00']));
    expect(parsed.lines.map((l) => [l.description, l.amountOre, l.flags])).toEqual([
      ['MELK', 2000, []],
      ['SMØR', null, ['noAmount']],
      ['BRØD', 3000, []],
    ]);
    expect(parsed.sumMatches).toBe(true);
  });

  it('a total that does not match the lines is reported, not hidden', () => {
    const parsed = parseReceiptText(p(['MELK 20,00', 'BRØD 30,00', 'SUM 55,00']));
    expect(parsed).toMatchObject({ totalOre: 5500, linesSumOre: 5000, sumMatches: false });
  });

  it('an impossible date is not a date', () => {
    expect(parseReceiptText(p(['31.02.2026 10:00', 'MELK 20,00'])).date).toBeNull();
    expect(parseReceiptText(p(['01.01.1999 10:00', 'MELK 20,00'])).date).toBeNull();
  });

  it('cuts long descriptions to 100 characters', () => {
    const parsed = parseReceiptText(p([`${'A'.repeat(150)} 10,00`]));
    expect(parsed.lines[0]?.description.length).toBe(100);
  });

  it('the result only has whole øre', () => {
    for (const fixture of [COOP_RECEIPT, NG_RECEIPT, NOISY_COOP_RECEIPT, GENERIC_RECEIPT]) {
      const parsed = parseReceiptText(fixture);
      for (const value of [
        parsed.totalOre,
        parsed.linesSumOre,
        ...parsed.lines.map((l) => l.amountOre),
      ]) {
        if (value !== null) expect(Number.isSafeInteger(value)).toBe(true);
      }
    }
  });
});

describe('payment lines are never stored (spec 08, privacy)', () => {
  it('recognises masked cards, terminal, AID, authorisation and card brands', () => {
    for (const line of [
      'xxxxxxxxxxxx0000-01',
      '************1234',
      'AID: A0000000000000',
      'Authorization: 000000',
      'Terminal: TEST0001',
      'BAX-000000/NETS',
      'Contactless',
      'BankAxept',
      '00 Godkjent',
      '(M00000/AE000000)',
    ]) {
      expect(isPaymentLine(line), line).toBe(true);
    }
  });

  it('keeps items, totals and dates', () => {
    for (const line of [
      'GULROT 1KG 19.90',
      'Totalt (8 Artikler) 132.32',
      '03.02.2026 17:06:10',
      'PANT 2.00',
    ]) {
      expect(isPaymentLine(line), line).toBe(false);
    }
  });

  it('removes them from the fictional receipt without touching the parse', () => {
    const kept = withoutPaymentLines(COOP_RECEIPT);
    expect(kept.some((l) => /xxxx|AID|Authorization|Terminal/i.test(l.text))).toBe(false);
    expect(parseReceiptText(kept)).toEqual(parseReceiptText(COOP_RECEIPT));
  });
});

describe('FR-RCPT-004 OCR habits from the pilot (made-up text)', () => {
  it('cleanOcrLine joins split amounts, reads O% as 0% and drops short junk at the left edge', () => {
    expect(cleanOcrLine('HÅ + Part O% 8,00')).toBe('+ Part 0% 8,00');
    expect(cleanOcrLine('Fy SMÅKAKER 15% 39, 90')).toBe('SMÅKAKER 15% 39,90');
    // A token with a digit stays (it could be a count): "2!" is kept, "N varer" still ends the items.
    expect(cleanOcrLine('2! Em 2 varer 66, 80')).toBe('2! Em 2 varer 66,80');
    expect(cleanOcrLine('Q-MELK 1L 20,00')).toBe('Q-MELK 1L 20,00');
    expect(cleanOcrLine('+ Pant 3,00')).toBe('+ Pant 3,00');
    // A short word is only dropped when real text follows it.
    expect(cleanOcrLine('OK 12,00')).toBe('OK 12,00');
  });

  it('a noisy NorgesGruppen reading: deposit, end of items and total are still found', () => {
    const parsed = parseReceiptText(NOISY_NG_RECEIPT);
    expect(parsed).toMatchObject({
      chain: 'kiwi',
      date: '2026-08-12',
      time: '18:02',
      receiptNo: '654321',
      totalOre: 6680,
      sumMatches: true,
    });
    expect(parsed.lines.map((l) => [l.description, l.amountOre, l.kind, l.vatRate])).toEqual([
      ['HAVREGRYN 1KG 157', 2490, 'item', null],
      ['+ Part', 200, 'deposit', 0],
      ['SMÅKAKER', 3990, 'item', 15],
    ]);
  });

  it('a time-like misread on an item line does not end the header, and junk after the total is allowed', () => {
    const parsed = parseReceiptText(NOISY_COOP_TIME_RECEIPT);
    expect(parsed.lines.map((l) => l.description)).toEqual([
      'gskv 1nN9 000000 1 AA',
      'RISGRYN 1KG',
      'HAVREMELK 1L 22:00',
      'KANEL',
    ]);
    expect(parsed.lines.map((l) => l.amountOre)).toEqual([null, null, 1940, 2190]);
    // "[41.30" once against "41. 30" and "41,30 1": the total is 41,30.
    expect(parsed.totalOre).toBe(4130);
    expect(parsed.sumMatches).toBe(true);
  });

  it('without a readable end, the date under the payment part is not taken for the header', () => {
    const parsed = parseReceiptText([
      { text: 'Salgskvittering 1234 01.02.2026 10:00', confidence: 90 },
      { text: 'MELK 20,00', confidence: 90 },
      { text: 'BRØD 30,00', confidence: 90 },
      { text: '01.02.2026 10:01:00', confidence: 90 },
    ]);
    expect(parsed.lines.map((l) => l.description)).toEqual(['MELK', 'BRØD']);
  });
});
