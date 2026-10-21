import type { RecipeLine } from '@smartmat/shared';

/** FR-REC-003: how the recipe page groups its ingredients, in this order. */
export const LINE_GROUPS = ['have', 'short', 'missing', 'staple'] as const;
export type LineGroup = (typeof LINE_GROUPS)[number];

export function lineGroup(line: Pick<RecipeLine, 'status'>): LineGroup {
  switch (line.status) {
    case 'enough':
      return 'have';
    case 'notEnough':
    case 'unknownAmount':
      return 'short';
    case 'missing':
      return 'missing';
    case 'staple':
      return 'staple';
  }
}
