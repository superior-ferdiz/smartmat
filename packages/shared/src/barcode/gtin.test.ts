import { describe, expect, it } from 'vitest';
import { checkDigit, expandUpcE, hasValidCheckDigit, isStoreCode, normalizeGtin } from './gtin';
import { categoryFromOffTags } from './offCategories';
import { gtinSchema } from '../schemas/barcodes';

// Check digits for these codes were worked out separately (by hand / in Python), not with checkDigit itself.

describe('FR-SCAN-003 check digit', () => {
  it.each([
    ['400638133393', 1],
    ['9638507', 4],
    ['03600029145', 2],
    ['1001234567890', 2],
    ['703801000073', 7],
  ])('%s → %i', (body, digit) => {
    expect(checkDigit(body)).toBe(digit);
  });

  it('accepts a code with the right check digit and refuses every other last digit', () => {
    expect(hasValidCheckDigit('4006381333931')).toBe(true);
    for (const wrong of ['0', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(hasValidCheckDigit(`400638133393${wrong}`)).toBe(false);
    }
  });

  it('a swap of two neighbouring digits is caught', () => {
    expect(hasValidCheckDigit('4006383133931')).toBe(false);
  });
});

describe('FR-SCAN-003 normalizeGtin', () => {
  it('EAN-13 stays as it is', () => {
    expect(normalizeGtin('4006381333931')).toEqual({
      ok: true,
      gtin: '4006381333931',
      storeCode: false,
    });
  });

  it('EAN-8 stays 8 digits', () => {
    expect(normalizeGtin('96385074')).toEqual({ ok: true, gtin: '96385074', storeCode: false });
  });

  it('UPC-A gets a leading 0', () => {
    expect(normalizeGtin('036000291452')).toMatchObject({ ok: true, gtin: '0036000291452' });
  });

  it('a GTIN-14 that starts with 0 becomes the GTIN-13 behind it; other GTIN-14s stay', () => {
    expect(normalizeGtin('04006381333931')).toMatchObject({ ok: true, gtin: '4006381333931' });
    expect(normalizeGtin('10012345678902')).toMatchObject({ ok: true, gtin: '10012345678902' });
  });

  it('removes spaces and hyphens', () => {
    expect(normalizeGtin(' 4 006381-333931 ')).toMatchObject({ ok: true, gtin: '4006381333931' });
  });

  it('says what is wrong', () => {
    expect(normalizeGtin('')).toEqual({ ok: false, error: 'validation.barcode.required' });
    expect(normalizeGtin('   ')).toEqual({ ok: false, error: 'validation.barcode.required' });
    expect(normalizeGtin('40063813339a1')).toEqual({
      ok: false,
      error: 'validation.barcode.digits',
    });
    expect(normalizeGtin('400638133393')).toEqual({
      ok: false,
      error: 'validation.barcode.checkDigit',
    });
    expect(normalizeGtin('4006381333932')).toEqual({
      ok: false,
      error: 'validation.barcode.checkDigit',
    });
    for (const length of [1, 7, 9, 10, 11, 15]) {
      expect(normalizeGtin('1'.repeat(length))).toEqual({
        ok: false,
        error: 'validation.barcode.length',
      });
    }
  });

  it('eight digits are EAN-8, unless the camera says UPC-E', () => {
    // 04252614 is a valid UPC-E code; as EAN-8 its check digit is wrong.
    expect(normalizeGtin('04252614')).toEqual({
      ok: false,
      error: 'validation.barcode.checkDigit',
    });
    expect(normalizeGtin('04252614', 'upc_e')).toEqual({
      ok: true,
      gtin: '0042100005264',
      storeCode: false,
    });
  });

  it('a UPC-E code with a wrong check digit or the wrong shape is refused', () => {
    expect(normalizeGtin('04252615', 'upc_e')).toEqual({
      ok: false,
      error: 'validation.barcode.checkDigit',
    });
    expect(normalizeGtin('4006381333931', 'upc_e')).toEqual({
      ok: false,
      error: 'validation.barcode.length',
    });
  });
});

describe('UPC-E expansion (all four rules for the last data digit)', () => {
  it.each([
    ['04252614', '042100005264'], // last digit 0–2: manufacturer digits + 0000 + product
    ['01234531', '012300000451'], // 3
    ['01234543', '012340000053'], // 4
    ['01234565', '012345000065'], // 5–9
  ])('%s → %s', (upcE, upcA) => {
    expect(expandUpcE(upcE)).toBe(upcA);
  });

  it('only number system 0 and 1 and exactly 8 digits', () => {
    expect(expandUpcE('24252614')).toBeNull();
    expect(expandUpcE('0425261')).toBeNull();
    expect(expandUpcE('042526145')).toBeNull();
  });
});

describe('store codes (spec 07)', () => {
  it.each([
    ['2312345000125', true], // 2x: weighed goods with price or weight in the code
    ['2012345678909', true],
    ['0212345678901', true], // UPC number system 2 (variable weight)
    ['0412345678909', true], // 04: a store's internal numbers
    ['20123451', true], // EAN-8 starting with 2
    ['01234565', true], // EAN-8 starting with 0
    ['4006381333931', false],
    ['7038010000737', false],
    ['0036000291452', false],
    ['96385074', false],
    ['40123455', false],
    ['02123456789010', true], // GTIN-14 with an indicator digit in front of a 02 code
  ])('%s → %s', (gtin, expected) => {
    expect(isStoreCode(gtin)).toBe(expected);
  });

  it('normalizeGtin marks store codes', () => {
    expect(normalizeGtin('2312345000125')).toMatchObject({ ok: true, storeCode: true });
    expect(normalizeGtin('20123451')).toMatchObject({ ok: true, storeCode: true });
  });
});

describe('gtinSchema (URL parameter and form)', () => {
  it('gives the normalized code', () => {
    expect(gtinSchema.parse('036000291452')).toEqual({ gtin: '0036000291452', storeCode: false });
  });

  it('gives the i18n key as message', () => {
    const result = gtinSchema.safeParse('123');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('validation.barcode.length');
  });
});

describe('Open Food Facts categories (KI-utkast)', () => {
  it('the most specific known tag wins', () => {
    expect(
      categoryFromOffTags([
        'en:breakfasts',
        'en:spreads',
        'en:sweet-spreads',
        'en:hazelnut-spreads',
      ]),
    ).toBe('spreads');
    expect(categoryFromOffTags(['en:frozen-foods', 'en:fishes'])).toBe('fish');
    expect(categoryFromOffTags(['en:fishes', 'en:frozen-foods'])).toBe('frozen');
  });

  it('no known tag → no category', () => {
    expect(categoryFromOffTags([])).toBeNull();
    expect(categoryFromOffTags(['fr:pates-a-tartiner', 'de:Other'])).toBeNull();
  });
});
