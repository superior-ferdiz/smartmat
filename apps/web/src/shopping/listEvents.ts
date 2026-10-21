import { useEffect, useRef, type RefObject } from 'react';

/*
 * KURS-03 (inferred): plain DOM event handling on the shopping list. Instead of one handler per row, ONE
 * listener on the list container handles every row (event delegation): the event bubbles up from the
 * checkbox or button that was used, and `closest('[data-item-id]')` finds the row it came from.
 * It keeps working when rows are added, removed or moved, without adding or removing listeners.
 *
 * (React also delegates its own onChange/onClick to the root internally. Here it is written out with
 * addEventListener so the mechanism is visible in our own code.)
 */

export type RowAction = 'edit' | 'remove';

export interface ListEventHandlers {
  onToggle: (itemId: string, checked: boolean) => void;
  onAction: (itemId: string, action: RowAction) => void;
}

const ROW = '[data-item-id]';

/** The id of the row an element belongs to. */
export function rowIdOf(element: Element | null): string | undefined {
  return element?.closest<HTMLElement>(ROW)?.dataset.itemId;
}

/**
 * The row that takes this row's place when it leaves the list (the next one, or else the previous one),
 * so keyboard focus can move there instead of falling back to the top of the page.
 */
export function neighbourRowId(container: HTMLElement | null, itemId: string): string | undefined {
  const row = container?.querySelector<HTMLElement>(`${ROW}[data-item-id="${CSS.escape(itemId)}"]`);
  const next = row?.nextElementSibling ?? row?.previousElementSibling ?? null;
  return next instanceof HTMLElement ? next.dataset.itemId : undefined;
}

export function useDelegatedListEvents(
  container: RefObject<HTMLElement | null>,
  handlers: ListEventHandlers,
) {
  // The listener is added once; it always calls the latest handlers (which close over the latest data).
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const root = container.current;
    if (!root) return;

    function onChange(event: Event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') return;
      const itemId = rowIdOf(input);
      if (itemId) latest.current.onToggle(itemId, input.checked);
    }

    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>('button[data-action]');
      const action = button?.dataset.action;
      const itemId = rowIdOf(button ?? null);
      if (itemId && (action === 'edit' || action === 'remove'))
        latest.current.onAction(itemId, action);
    }

    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    return () => {
      root.removeEventListener('change', onChange);
      root.removeEventListener('click', onClick);
    };
  }, [container]);
}
