import { describe, expect, it } from 'vitest';
import {
  buildAliasIndex,
  linkedIngredientId,
  linkItem,
  matchByName,
  normalizeAlias,
  normalizeWords,
} from './matching';

const index = buildAliasIndex([
  {
    id: 'melk',
    name: 'Melk',
    aliases: ['lettmelk', 'helmelk', 'skummet melk', 'ekstra lett melk'],
  },
  { id: 'kokosmelk', name: 'Kokosmelk', aliases: ['kokosnøttmelk'] },
  { id: 'kylling', name: 'Kyllingfilet', aliases: ['kyllingbryst', 'kylling filet'] },
  { id: 'lok', name: 'Løk', aliases: ['gul løk'] },
  { id: 'rodlok', name: 'Rødløk', aliases: ['rød løk'] },
  { id: 'smor', name: 'Smør', aliases: ['meierismør'] },
  { id: 'a', name: 'Ost', aliases: ['hvit'] },
  { id: 'b', name: 'Pepper', aliases: ['sort'] },
]);

describe('spec 05 normalizeWords', () => {
  it.each([
    ['Tine Lettmelk 1 l', ['tine', 'lettmelk']],
    ['Lettmelk 1,5 l', ['lettmelk']],
    ['Kyllingfilet 500g', ['kyllingfilet']],
    ['Melk (0,5%)', ['melk']],
    ['  Gul   løk, 2 stk ', ['gul', 'løk']],
    ['ØKOLOGISK RØDLØK', ['økologisk', 'rødløk']],
    ['Egg 12 pk', ['egg']],
    ['Brus 2x1,5l', ['brus']],
    ['Tomater 10 stk', ['tomater']],
    ['2 løk', ['løk']],
    ['', []],
  ])('%j → %j', (input, words) => {
    expect(normalizeWords(input)).toEqual(words);
  });

  it('a unit letter at the start of a word is not taken as a unit ("2 løk" keeps "løk")', () => {
    expect(normalizeWords('3 gulrøtter')).toEqual(['gulrøtter']);
  });

  it('aliases are stored normalised', () => {
    expect(normalizeAlias('  Skummet   MELK ')).toBe('skummet melk');
  });
});

describe('spec 05 matchByName', () => {
  it.each([
    ['Tine lettmelk 1 l', 'melk', 'lettmelk'],
    ['Melk', 'melk', 'melk'],
    ['Skummet melk', 'melk', 'skummet melk'],
    ['Kyllingfilet', 'kylling', 'kyllingfilet'],
    ['Prior kylling filet 400 g', 'kylling', 'kylling filet'],
    ['Gul løk', 'lok', 'gul løk'],
    ['Rød løk', 'rodlok', 'rød løk'],
    ['Rødløk', 'rodlok', 'rødløk'],
    ['Kokosmelk', 'kokosmelk', 'kokosmelk'],
  ])('%s → %s (via "%s")', (name, ingredientId, alias) => {
    expect(matchByName(name, index)).toEqual({ kind: 'matched', ingredientId, alias });
  });

  it('matches whole words only: "kokosmelk" is not melk, "sjokolademelk" matches nothing', () => {
    expect(matchByName('Kokosmelk', index)).toMatchObject({ ingredientId: 'kokosmelk' });
    expect(matchByName('Sjokolademelk', index)).toEqual({ kind: 'unmatched' });
    expect(matchByName('Smørbrød', index)).toEqual({ kind: 'unmatched' });
  });

  it('the longest alias wins: "rød løk" (2 words) beats "løk" (1 word)', () => {
    expect(matchByName('Rød løk', index)).toMatchObject({ ingredientId: 'rodlok' });
  });

  it('two ingredients matching with as many words is ambiguous, never a guess', () => {
    expect(matchByName('Hvit og sort', index)).toEqual({
      kind: 'ambiguous',
      ingredientIds: ['a', 'b'],
    });
    // Not decided by word length either: "kyllingfilet" is longer than "løk", but both are one word.
    expect(matchByName('Kyllingfilet med løk', index)).toEqual({
      kind: 'ambiguous',
      ingredientIds: ['kylling', 'lok'],
    });
  });

  it('the same ingredient matched twice is not ambiguous', () => {
    expect(matchByName('Lettmelk og helmelk', index)).toMatchObject({ ingredientId: 'melk' });
  });

  it('unknown names do not match', () => {
    expect(matchByName('Oppvaskmiddel', index)).toEqual({ kind: 'unmatched' });
  });
});

describe('spec 05 linkItem: the user’s choice wins over the name', () => {
  const item = { name: 'Lettmelk', ingredientId: null };

  it('auto uses the name', () => {
    const link = linkItem({ ...item, ingredientMatch: 'auto' }, index);
    expect(link).toEqual({ kind: 'auto', ingredientId: 'melk', alias: 'lettmelk' });
    expect(linkedIngredientId(link)).toBe('melk');
  });

  it('manual uses the chosen ingredient, even if the name says something else', () => {
    const link = linkItem(
      { name: 'Lettmelk', ingredientMatch: 'manual', ingredientId: 'kokosmelk' },
      index,
    );
    expect(link).toEqual({ kind: 'manual', ingredientId: 'kokosmelk' });
  });

  it('none links nothing, even if the name matches', () => {
    const link = linkItem({ ...item, ingredientMatch: 'none' }, index);
    expect(link).toEqual({ kind: 'none' });
    expect(linkedIngredientId(link)).toBeNull();
  });

  it('ambiguous and unmatched names are not linked', () => {
    expect(
      linkedIngredientId(linkItem({ ...item, name: 'Hvit sort', ingredientMatch: 'auto' }, index)),
    ).toBeNull();
    expect(
      linkedIngredientId(linkItem({ ...item, name: 'Såpe', ingredientMatch: 'auto' }, index)),
    ).toBeNull();
  });
});
