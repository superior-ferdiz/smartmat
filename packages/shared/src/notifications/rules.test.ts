import { describe, expect, it } from 'vitest';
import { osloDate } from '../dates/dates';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  expiryStage,
  MAX_EXPIRY_NOTIFICATIONS,
  NOTIFICATION_KEY_MAX_LENGTH,
  NOTIFICATION_KEY_PATTERN,
  notificationsFor,
  type DatedBatch,
  type NotificationInput,
  type NotificationSettingsValues,
} from './rules';

const BATCH = '0199f0aa-0000-7000-8000-000000000001';
const ITEM = '0199f0aa-0000-7000-8000-0000000000aa';

function batch(partial: Partial<DatedBatch> = {}): DatedBatch {
  return {
    batchId: BATCH,
    itemId: ITEM,
    itemName: 'Kyllingfilet',
    expiryKind: 'use_by',
    expiryDate: '2026-10-26',
    ...partial,
  };
}

function input(partial: Partial<NotificationInput> = {}): NotificationInput {
  return {
    today: '2026-10-25',
    settings: DEFAULT_NOTIFICATION_SETTINGS,
    batches: [],
    budget: { month: '2026-10', usedPercent: null },
    shopping: [],
    ...partial,
  };
}

const settings = (partial: Partial<NotificationSettingsValues>) => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  ...partial,
});

describe('FR-NOTIF-001 expiryStage – day boundaries (today = 2026-10-25)', () => {
  const today = '2026-10-25';
  it.each([
    ['use_by', '2026-10-29', 3, null],
    ['use_by', '2026-10-28', 3, 'useBySoon'],
    ['use_by', '2026-10-27', 3, 'useBySoon'],
    ['use_by', '2026-10-27', 1, null],
    ['use_by', '2026-10-26', 1, 'useBySoon'],
    ['use_by', '2026-10-26', 0, null],
    ['use_by', '2026-10-25', 0, 'useByToday'],
    ['use_by', '2026-10-24', 1, 'useByPassed'],
    ['use_by', '2026-10-23', 1, 'useByPassed'],
    ['use_by', '2026-10-22', 1, null],
    ['best_before', '2026-11-01', 7, 'bestBeforeSoon'],
    ['best_before', '2026-11-02', 7, null],
    ['best_before', '2026-10-26', 1, 'bestBeforeSoon'],
    ['best_before', '2026-10-25', 0, 'bestBeforeToday'],
    ['best_before', '2026-10-24', 1, null],
  ] as const)('%s %s with %s days before → %s', (kind, date, daysBefore, expected) => {
    const stage = expiryStage(
      { expiryKind: kind, expiryDate: date },
      today,
      settings({ daysBefore }),
    );
    expect(stage?.kind ?? null).toBe(expected);
  });

  it('never gives a best-before notification after the date (it is about quality)', () => {
    for (const date of ['2026-10-24', '2026-10-01', '2025-01-01']) {
      expect(
        expiryStage({ expiryKind: 'best_before', expiryDate: date }, today, settings({})),
      ).toBeNull();
    }
  });

  it('respects the switches per date kind', () => {
    const off = settings({ useBy: false, bestBefore: false });
    expect(expiryStage({ expiryKind: 'use_by', expiryDate: today }, today, off)).toBeNull();
    expect(expiryStage({ expiryKind: 'best_before', expiryDate: today }, today, off)).toBeNull();
  });
});

describe('FR-NOTIF-001 "today" in Norway, also around midnight and the DST change', () => {
  // 2026-10-25 is the night summer time ends in Norway (03:00 CEST → 02:00 CET).
  it.each([
    ['2026-10-24T21:59:00Z', '2026-10-24'], // 23:59 CEST
    ['2026-10-24T22:01:00Z', '2026-10-25'], // 00:01 CEST
    ['2026-10-25T22:59:00Z', '2026-10-25'], // 23:59 CET, after the change
    ['2026-10-25T23:01:00Z', '2026-10-26'], // 00:01 CET
    ['2026-03-28T22:59:00Z', '2026-03-28'], // 23:59 CET, the night summer time starts
    ['2026-03-28T23:01:00Z', '2026-03-29'],
  ])('%s is %s in Oslo', (moment, date) => {
    expect(osloDate(new Date(moment))).toBe(date);
  });

  it('a use-by date tomorrow is "soon" until midnight, and "today" one minute after', () => {
    const b = batch({ expiryDate: '2026-10-26' });
    const before = notificationsFor(
      input({ today: osloDate(new Date('2026-10-25T22:59:00Z')), batches: [b] }),
    );
    const after = notificationsFor(
      input({ today: osloDate(new Date('2026-10-25T23:01:00Z')), batches: [b] }),
    );
    expect(before.map((n) => n.kind)).toEqual(['useBySoon']);
    expect(after.map((n) => n.kind)).toEqual(['useByToday']);
  });
});

describe('FR-NOTIF-004 keys – the same notification never comes twice', () => {
  it('gives the same key on every read of the same stage', () => {
    const first = notificationsFor(input({ batches: [batch()] }));
    const second = notificationsFor(input({ batches: [batch()] }));
    expect(first[0]?.key).toBe(`useBy:soon:${BATCH}:2026-10-26`);
    expect(second[0]?.key).toBe(first[0]?.key);
  });

  it('keeps one key through the "soon" days, so the text updates instead of a new notification', () => {
    const b = batch({ expiryDate: '2026-10-28' });
    const s = settings({ daysBefore: 3 });
    const keys = ['2026-10-25', '2026-10-26', '2026-10-27'].map(
      (today) => notificationsFor(input({ today, settings: s, batches: [b] }))[0]?.key,
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('gives a new key for a new stage and for a corrected date', () => {
    const keys = new Set([
      notificationsFor(input({ today: '2026-10-25', batches: [batch()] }))[0]?.key,
      notificationsFor(input({ today: '2026-10-26', batches: [batch()] }))[0]?.key,
      notificationsFor(input({ today: '2026-10-27', batches: [batch()] }))[0]?.key,
      notificationsFor(input({ batches: [batch({ expiryDate: '2026-10-25' })] }))[0]?.key,
    ]);
    expect(keys.size).toBe(4);
  });

  it('has different keys for the two date kinds of the same batch and date', () => {
    const a = notificationsFor(input({ batches: [batch()] }))[0]?.key;
    const b = notificationsFor(input({ batches: [batch({ expiryKind: 'best_before' })] }))[0]?.key;
    expect(a).not.toBe(b);
  });

  it('only produces keys the database accepts (pattern and length)', () => {
    const all = notificationsFor(
      input({
        today: '2026-10-25',
        settings: settings({ daysBefore: 7 }),
        batches: [
          batch(),
          batch({ batchId: ITEM, expiryKind: 'best_before', expiryDate: '2026-10-25' }),
        ],
        budget: { month: '2026-10', usedPercent: 85 },
        shopping: [
          {
            text: 'Melk',
            createdAt: new Date('2026-10-25T10:00:00Z'),
            creator: { kind: 'member', displayName: 'Kari' },
          },
        ],
      }),
    );
    expect(all).toHaveLength(4);
    for (const n of all) {
      expect(n.key).toMatch(NOTIFICATION_KEY_PATTERN);
      expect(n.key.length).toBeLessThanOrEqual(NOTIFICATION_KEY_MAX_LENGTH);
    }
    expect(new Set(all.map((n) => n.key)).size).toBe(all.length);
  });
});

describe('FR-NOTIF-001 order and limit', () => {
  it('puts the most serious first: use-by passed, today, soon, then best before', () => {
    const result = notificationsFor(
      input({
        batches: [
          batch({
            batchId: 'b1',
            itemName: 'Melk',
            expiryKind: 'best_before',
            expiryDate: '2026-10-26',
          }),
          batch({ batchId: 'b2', itemName: 'Kjøttdeig', expiryDate: '2026-10-24' }),
          batch({ batchId: 'b3', itemName: 'Laks', expiryDate: '2026-10-26' }),
          batch({
            batchId: 'b4',
            itemName: 'Yoghurt',
            expiryKind: 'best_before',
            expiryDate: '2026-10-25',
          }),
          batch({ batchId: 'b5', itemName: 'Fiskekaker', expiryDate: '2026-10-25' }),
        ],
      }),
    );
    expect(result.map((n) => n.kind)).toEqual([
      'useByPassed',
      'useByToday',
      'useBySoon',
      'bestBeforeToday',
      'bestBeforeSoon',
    ]);
  });

  it(`shows at most ${MAX_EXPIRY_NOTIFICATIONS} date notifications`, () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      batch({ batchId: `b${i}`, itemName: `Vare ${i}` }),
    );
    expect(notificationsFor(input({ batches: many }))).toHaveLength(MAX_EXPIRY_NOTIFICATIONS);
  });
});

describe('FR-NOTIF-002 budget', () => {
  it.each([
    [null, null],
    [0, null],
    [79, null],
    [80, 'budgetNearlyUsed'],
    [99, 'budgetNearlyUsed'],
    [100, 'budgetExceeded'],
    [250, 'budgetExceeded'],
  ] as const)('%s %% → %s', (usedPercent, kind) => {
    const result = notificationsFor(input({ budget: { month: '2026-10', usedPercent } }));
    expect(result[0]?.kind ?? null).toBe(kind);
  });

  it('has one key per month and threshold, and none when switched off', () => {
    const at = (month: string, usedPercent: number) =>
      notificationsFor(input({ budget: { month, usedPercent } }))[0]?.key;
    expect(at('2026-10', 81)).toBe('budget:2026-10:80');
    expect(at('2026-10', 95)).toBe('budget:2026-10:80');
    expect(at('2026-10', 100)).toBe('budget:2026-10:100');
    expect(at('2026-11', 81)).toBe('budget:2026-11:80');
    expect(
      notificationsFor(
        input({
          settings: settings({ budget: false }),
          budget: { month: '2026-10', usedPercent: 120 },
        }),
      ),
    ).toEqual([]);
  });
});

describe('FR-NOTIF-003 shopping list', () => {
  const kari = { kind: 'member', displayName: 'Kari' } as const;
  const former = { kind: 'former', displayName: null } as const;
  const lines = [
    { text: 'Melk', createdAt: new Date('2026-10-25T08:00:00Z'), creator: kari },
    { text: 'Egg', createdAt: new Date('2026-10-25T09:00:00Z'), creator: former },
    { text: 'Brød', createdAt: new Date('2026-10-25T10:00:00Z'), creator: kari },
    { text: 'Ost', createdAt: new Date('2026-10-25T07:00:00Z'), creator: kari },
  ];

  it('is one notification with the newest lines first, each adder once', () => {
    const [n] = notificationsFor(input({ shopping: lines }));
    expect(n).toEqual({
      kind: 'shoppingAdded',
      key: `shopping:${Date.parse('2026-10-25T10:00:00Z')}`,
      count: 4,
      texts: ['Brød', 'Egg', 'Melk'],
      addedBy: [kari, former],
      latestAt: '2026-10-25T10:00:00.000Z',
    });
  });

  it('gets a new key when another line is added, and none when off or empty', () => {
    const before = notificationsFor(input({ shopping: lines }))[0]?.key;
    const after = notificationsFor(
      input({
        shopping: [
          ...lines,
          { text: 'Smør', createdAt: new Date('2026-10-25T11:00:00Z'), creator: kari },
        ],
      }),
    )[0]?.key;
    expect(after).not.toBe(before);
    expect(
      notificationsFor(input({ settings: settings({ shopping: false }), shopping: lines })),
    ).toEqual([]);
    expect(notificationsFor(input())).toEqual([]);
  });
});
