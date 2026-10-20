import { useId } from 'react';

/** Stable ids for a control and the hint/error elements that describe it. */
export function useFieldIds(id?: string) {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  return { controlId, hintId: `${controlId}-hint`, errorId: `${controlId}-error` };
}
