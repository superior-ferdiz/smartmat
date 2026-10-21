import { useTranslation } from 'react-i18next';
import { expiryStatus, type ExpiryKind } from '@smartmat/shared';
import { Icon } from '../components/Icon/Icon';
import { Tag, type TagTone } from '../components/Tag/Tag';
import { useFormatDate } from './formatHooks';

interface ExpiryProps {
  kind: ExpiryKind | null;
  date: string | null;
  today: string;
}

/**
 * FR-INV-005: the status of one batch as a tag. "Siste forbruksdag" (use by, food safety) and
 * "best før" (best before, quality) are worded differently; a passed use-by date is shown as a danger.
 * The meaning is always in the text and icon, never only in the colour.
 */
export function ExpiryTag({ kind, date, today }: ExpiryProps) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  if (!kind || !date) return <Tag tone="neutral">{t('inventory.expiry.none')}</Tag>;

  const { status, daysLeft = 0 } = expiryStatus(date, today);
  const k = kind === 'use_by' ? 'useBy' : 'bestBefore';
  let tone: TagTone = 'neutral';
  let text: string;
  if (status === 'passed') {
    tone = kind === 'use_by' ? 'danger' : 'warning';
    text = t(`inventory.expiry.${k}.passed`);
  } else if (status === 'today') {
    tone = kind === 'use_by' ? 'danger' : 'warning';
    text = t(`inventory.expiry.${k}.today`);
  } else if (status === 'soon') {
    tone = 'warning';
    text = t(`inventory.expiry.${k}.soon`, { count: daysLeft });
  } else {
    text = t(`inventory.expiry.${k}.on`, { date: formatDate(date) });
  }
  const icon =
    status === 'passed' || status === 'today' ? 'warning' : status === 'soon' ? 'clock' : null;
  return (
    <Tag tone={tone}>
      {icon && <Icon name={icon} size={14} />}
      {text}
    </Tag>
  );
}

/** Advice for a passed date. Never suggests eating food after its use-by date. */
export function ExpiryAdvice({
  kind,
  date,
  today,
  className,
}: ExpiryProps & { className?: string }) {
  const { t } = useTranslation();
  if (!kind || !date) return null;
  const { status } = expiryStatus(date, today);
  if (status !== 'passed') return null;
  return (
    <p className={className}>
      {t(kind === 'use_by' ? 'inventory.advice.useByPassed' : 'inventory.advice.bestBeforePassed')}
    </p>
  );
}
