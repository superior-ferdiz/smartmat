import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { sortShoppingItems, type DisplayUnit, type ShoppingItemResponse } from '@smartmat/shared';
import { ApiError } from '../../api/client';
import { Alert } from '../../components/Alert/Alert';
import { Button, LinkButton } from '../../components/Button/Button';
import { Dialog } from '../../components/Dialog/Dialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { Icon } from '../../components/Icon/Icon';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { NumberField } from '../../components/NumberField/NumberField';
import { Select } from '../../components/Select/Select';
import { TextField } from '../../components/TextField/TextField';
import { useToast } from '../../components/Toast/toastContext';
import { RECIPES_PATH } from '../../app/navigation';
import type { FieldErrors } from '../../forms/fieldErrors';
import { useValidationMessage } from '../../i18n/useValidationMessage';
import { useFormatQuantity } from '../../inventory/formatHooks';
import { Page } from '../../layout/Page';
import { useJoinList } from '../../recipes/formatHooks';
import {
  useAddShoppingItem,
  useClearChecked,
  useRemoveShoppingItem,
  useShoppingList,
  useToggleChecked,
  useUpdateShoppingItem,
} from '../../shopping/api';
import {
  amountValues,
  parseLineForm,
  SHOPPING_UNITS,
  type LineFormValues,
} from '../../shopping/forms';
import { neighbourRowId, useDelegatedListEvents } from '../../shopping/listEvents';
import styles from '../../shopping/shopping.module.css';
import { ToInventoryDialog } from './ToInventoryDialog';

const QUICK_ADD_TEXT_ID = 'shopping-quick-text';
const checkboxId = (itemId: string) => `shopping-check-${itemId}`;

/** API field errors use the body's names ("quantity.quantityBase"); the form has one amount field. */
function formErrors(error: unknown): FieldErrors | null {
  if (!(error instanceof ApiError) || Object.keys(error.fields).length === 0) return null;
  const errors: FieldErrors = {};
  for (const [field, key] of Object.entries(error.fields))
    errors[field.startsWith('quantity') ? 'quantity' : field] = key;
  return errors;
}

/** FR-SHOP-001/003: the household's shopping list, built to be used with one hand in a shop. */
export function ShoppingListPage() {
  const { t } = useTranslation();
  const list = useShoppingList();

  return (
    <Page title={t('nav.sections.shoppingList')} lead={t('pages.shoppingList.lead')}>
      {list.isPending ? (
        <LoadingState label={t('shopping.loading')} />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <ShoppingList items={list.data} />
      )}
    </Page>
  );
}

type Dialogs =
  { type: 'edit'; item: ShoppingItemResponse } | { type: 'clear' } | { type: 'stock' } | null;

/** Where keyboard focus goes after the list changes: a row's checkbox, or the quick-add field. */
type FocusTarget = { itemId: string } | 'quickAdd' | null;

function ShoppingList({ items }: { items: ShoppingItemResponse[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useRemoveShoppingItem();
  // Bumped when a tick is rolled back: the checkboxes are uncontrolled, so the one the user clicked still
  // shows the tick in the DOM. A new key rebuilds them from the restored data.
  const [checkboxVersion, setCheckboxVersion] = useState(0);
  const toggle = useToggleChecked(() => {
    setCheckboxVersion((v) => v + 1);
    toast.show({ message: t('shopping.toast.checkFailed'), variant: 'error' });
  });
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [announcement, setAnnouncement] = useState('');
  // A ref, not state: where focus should go is only read after the next render, never rendered itself.
  const focusTarget = useRef<FocusTarget>(null);
  const container = useRef<HTMLDivElement>(null);

  const sorted = sortShoppingItems(items);
  const open = sorted.filter((i) => !i.checked);
  const checked = sorted.filter((i) => i.checked);
  const byId = new Map(items.map((i) => [i.id, i]));

  /** Focus the row that takes this one's place, or the quick-add field if the list section is now empty. */
  const focusNeighbourOf = (itemId: string) => {
    const neighbour = neighbourRowId(container.current, itemId);
    focusTarget.current = neighbour ? { itemId: neighbour } : 'quickAdd';
  };

  useDelegatedListEvents(container, {
    onToggle(itemId, isChecked) {
      const item = byId.get(itemId);
      if (!item) return;
      // The row moves to the other section; focus stays where the user is working.
      focusNeighbourOf(itemId);
      toggle.mutate({ itemId, checked: isChecked });
      setAnnouncement(
        t(isChecked ? 'shopping.announce.checked' : 'shopping.announce.unchecked', {
          text: item.text,
        }),
      );
    },
    onAction(itemId, action) {
      const item = byId.get(itemId);
      if (!item) return;
      if (action === 'edit') {
        setDialog({ type: 'edit', item });
        return;
      }
      focusNeighbourOf(itemId);
      remove.mutate(itemId, {
        onSuccess: () => setAnnouncement(t('shopping.announce.removed', { text: item.text })),
        onError: () => toast.show({ message: t('errors.internal'), variant: 'error' }),
      });
    },
  });

  // Move focus once the list has re-rendered with the change (the row may have moved or disappeared).
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    const id = target === 'quickAdd' ? QUICK_ADD_TEXT_ID : checkboxId(target.itemId);
    const element = document.getElementById(id);
    if (element) {
      element.focus();
      focusTarget.current = null;
    }
  }, [items]);

  return (
    <>
      <QuickAdd onAdded={setAnnouncement} />
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <div ref={container} className={styles.section}>
        {items.length === 0 ? (
          <EmptyState
            icon="shoppingList"
            title={t('shopping.empty.title')}
            description={t('shopping.empty.text')}
            action={
              <LinkButton to={RECIPES_PATH} variant="secondary">
                {t('shopping.empty.recipes')}
              </LinkButton>
            }
          />
        ) : (
          <>
            <section aria-labelledby="shopping-open" className={styles.section}>
              <h2 id="shopping-open" className={styles.sectionTitle}>
                {t('shopping.open', { count: open.length })}
              </h2>
              {open.length === 0 ? (
                <p className={styles.note}>{t('shopping.allChecked')}</p>
              ) : (
                <Rows items={open} version={checkboxVersion} />
              )}
            </section>

            {checked.length > 0 && (
              <section aria-labelledby="shopping-checked" className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 id="shopping-checked" className={styles.sectionTitle}>
                    {t('shopping.checked', { count: checked.length })}
                  </h2>
                  <div className={styles.toolbar}>
                    <Button
                      icon={<Icon name="inventory" size={20} />}
                      onClick={() => setDialog({ type: 'stock' })}
                    >
                      {t('shopping.actions.toInventory')}
                    </Button>
                    <Button variant="ghost" onClick={() => setDialog({ type: 'clear' })}>
                      {t('shopping.actions.clearChecked')}
                    </Button>
                  </div>
                </div>
                <Rows items={checked} version={checkboxVersion} />
              </section>
            )}
          </>
        )}
      </div>

      {dialog?.type === 'edit' && (
        <EditDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSaved={() => setAnnouncement(t('shopping.announce.saved'))}
        />
      )}
      <ClearDialog
        open={dialog?.type === 'clear'}
        count={checked.length}
        onClose={() => setDialog(null)}
      />
      {dialog?.type === 'stock' && (
        <ToInventoryDialog lines={checked} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

/**
 * The rows of one section. No event handlers here: the checkboxes and buttons are handled by the one
 * delegated listener on the container (useDelegatedListEvents). The checkbox is uncontrolled and keyed on
 * its state (and `version`), so the DOM is rebuilt from the data whenever it changes or is rolled back.
 */
function Rows({ items, version }: { items: ShoppingItemResponse[]; version: number }) {
  const { t } = useTranslation();
  const formatQuantity = useFormatQuantity();
  const join = useJoinList();

  return (
    <ul role="list" className={styles.list}>
      {items.map((item) => {
        // One recipe that asked for exactly the line's amount: just say where it came from (no repeated amount).
        const onlyShare = item.recipes.length === 1 ? item.recipes[0] : undefined;
        const shares =
          onlyShare && onlyShare.quantityBase === item.quantityBase
            ? [t('shopping.shareFrom', { title: onlyShare.title })]
            : item.recipes.map((r) =>
                r.quantityBase === null || item.unit === null
                  ? t('shopping.shareNoAmount', { title: r.title })
                  : t('shopping.share', {
                      title: r.title,
                      amount: formatQuantity(r.quantityBase, item.unit),
                    }),
              );
        return (
          <li
            key={item.id}
            data-item-id={item.id}
            className={[styles.row, item.checked ? styles.checkedRow : ''].join(' ')}
          >
            <input
              key={`${item.id}:${String(item.checked)}:${version}`}
              id={checkboxId(item.id)}
              type="checkbox"
              className={styles.check}
              defaultChecked={item.checked}
            />
            <label htmlFor={checkboxId(item.id)} className={styles.label}>
              <span className={styles.text}>{item.text}</span>
              {item.quantityBase !== null && item.unit !== null && (
                <span className={`${styles.amount} tabular-nums`}>
                  {formatQuantity(item.quantityBase, item.unit)}
                </span>
              )}
              {shares.length > 0 && <span className={styles.shares}>{join(shares)}</span>}
            </label>
            <button
              type="button"
              className={styles.iconButton}
              data-action="edit"
              aria-label={t('shopping.actions.edit', { text: item.text })}
            >
              <Icon name="edit" size={20} />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              data-action="remove"
              aria-label={t('shopping.actions.remove', { text: item.text })}
            >
              <Icon name="trash" size={20} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const emptyLine = (): LineFormValues => ({ text: '', amount: '', displayUnit: 'stk' });

/** FR-SHOP-001: type and press Enter. Focus stays in the field, so the next item can be typed at once. */
function QuickAdd({ onAdded }: { onAdded: (message: string) => void }) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const add = useAddShoppingItem();
  const [values, setValues] = useState(emptyLine);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // One id per line typed: a double submit (or a retry after a lost answer) gives one line (NFR-DATA-002).
  const requestId = useRef<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseLineForm(values);
    setErrors(parsed.errors);
    setFormError(null);
    if (!parsed.input) return;
    requestId.current ??= crypto.randomUUID();
    add.mutate(
      { ...parsed.input, clientRequestId: requestId.current },
      {
        onSuccess: ({ item, similarItemId }) => {
          requestId.current = null;
          setValues(emptyLine());
          onAdded(
            t(similarItemId ? 'shopping.announce.similar' : 'shopping.announce.added', {
              text: item.text,
            }),
          );
        },
        onError: (error) => {
          const fields = formErrors(error);
          if (fields) setErrors(fields);
          else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
        },
      },
    );
  }

  return (
    <form className={styles.quickAdd} onSubmit={submit} noValidate aria-labelledby="quick-add">
      <h2 id="quick-add" className={styles.quickAddTitle}>
        {t('shopping.quickAdd.title')}
      </h2>
      {formError && <Alert variant="error">{message(formError)}</Alert>}
      <div className={styles.quickAddFields}>
        <TextField
          id={QUICK_ADD_TEXT_ID}
          label={t('shopping.quickAdd.text')}
          value={values.text}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setValues({ ...values, text: e.target.value })}
          error={message(errors.text)}
        />
        <div className={styles.quickAddRow}>
          <NumberField
            id="shopping-quick-amount"
            label={t('shopping.quickAdd.amount')}
            optional
            value={values.amount}
            onChange={(e) => setValues({ ...values, amount: e.target.value })}
            error={message(errors.quantity)}
          />
          <Select
            id="shopping-quick-unit"
            label={t('shopping.quickAdd.unit')}
            value={values.displayUnit}
            onChange={(e) => setValues({ ...values, displayUnit: e.target.value as DisplayUnit })}
            options={SHOPPING_UNITS.map((u) => ({ value: u, label: t(`units.${u}`) }))}
          />
          <Button type="submit" loading={add.isPending} icon={<Icon name="plus" size={20} />}>
            {t('shopping.quickAdd.submit')}
          </Button>
        </div>
      </div>
    </form>
  );
}

function EditDialog({
  item,
  onClose,
  onSaved,
}: {
  item: ShoppingItemResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const message = useValidationMessage();
  const update = useUpdateShoppingItem();
  const [values, setValues] = useState<LineFormValues>(() => ({
    text: item.text,
    ...amountValues(item.quantityBase, item.unit),
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseLineForm(values);
    setErrors(parsed.errors);
    if (!parsed.input) return;
    update.mutate(
      { itemId: item.id, text: parsed.input.text, quantity: parsed.input.quantity ?? null },
      {
        onSuccess: () => {
          onSaved();
          onClose();
        },
        onError: (error) => {
          const fields = formErrors(error);
          if (fields) setErrors(fields);
          else setFormError(error instanceof ApiError ? error.code : 'errors.internal');
        },
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title={t('shopping.edit.title')}>
      <form className={styles.form} onSubmit={submit} noValidate>
        {formError && <Alert variant="error">{message(formError)}</Alert>}
        <TextField
          id="shopping-edit-text"
          label={t('shopping.quickAdd.text')}
          value={values.text}
          onChange={(e) => setValues({ ...values, text: e.target.value })}
          error={message(errors.text)}
        />
        <div className={styles.fieldRow}>
          <NumberField
            id="shopping-edit-amount"
            label={t('shopping.quickAdd.amount')}
            hint={t('shopping.edit.hint')}
            optional
            value={values.amount}
            onChange={(e) => setValues({ ...values, amount: e.target.value })}
            error={message(errors.quantity)}
          />
          <Select
            id="shopping-edit-unit"
            label={t('shopping.quickAdd.unit')}
            value={values.displayUnit}
            onChange={(e) => setValues({ ...values, displayUnit: e.target.value as DisplayUnit })}
            options={SHOPPING_UNITS.map((u) => ({ value: u, label: t(`units.${u}`) }))}
          />
        </div>
        <div className={styles.buttons}>
          <Button type="submit" loading={update.isPending}>
            {t('common.save')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ClearDialog({
  open,
  count,
  onClose,
}: {
  open: boolean;
  count: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const clear = useClearChecked();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('shopping.clear.title')}
      description={t('shopping.clear.text', { count })}
    >
      <div className={styles.buttons}>
        <Button
          variant="danger"
          loading={clear.isPending}
          onClick={() =>
            clear.mutate(undefined, {
              onSuccess: ({ removed }) => {
                toast.show({ message: t('shopping.toast.cleared', { count: removed }) });
                onClose();
              },
              onError: () => toast.show({ message: t('errors.internal'), variant: 'error' }),
            })
          }
        >
          {t('shopping.clear.confirm')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Dialog>
  );
}
