import { useTranslation } from 'react-i18next';
import type { CreatorRef } from '@smartmat/shared';
import { ApiError } from '../api/client';
import type { FieldErrors } from '../forms/fieldErrors';

/** "26. okt. 10:00" – when an invitation expires. */
export function useFormatDateTime() {
  const { i18n } = useTranslation();
  return (iso: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'nb-NO', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Oslo',
    }).format(new Date(iso));
}

/** FR-HH-007: "Kari", "Tidligere medlem" or "Slettet bruker". */
export function useCreatorName() {
  const { t } = useTranslation();
  return (creator: CreatorRef) =>
    creator.kind === 'member' && creator.displayName
      ? creator.displayName
      : creator.kind === 'former'
        ? t('household.creator.former')
        : t('household.creator.unknown');
}

/**
 * FR-HH-007: "Lagt til av Kari" – only worth saying in a shared household, or when the person is gone
 * (then the household once was shared). Null when it should not be shown.
 */
export function useAddedBy(shared: boolean) {
  const { t } = useTranslation();
  const name = useCreatorName();
  return (creator: CreatorRef) =>
    shared || creator.kind === 'former'
      ? t('household.creator.addedBy', { name: name(creator) })
      : null;
}

/** A failed request as field errors (shown at the fields) or one message for the whole form. */
export function apiErrorState(error: unknown): { fields: FieldErrors; form: string | null } {
  if (error instanceof ApiError) {
    return Object.keys(error.fields).length > 0
      ? { fields: error.fields, form: null }
      : { fields: {}, form: error.code };
  }
  return { fields: {}, form: 'errors.internal' };
}
