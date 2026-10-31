import type { ReceiptStatus } from '@smartmat/shared';
import type { TagTone } from '../components/Tag/Tag';

/** The colour of a receipt's status tag; the text always says the status too. */
export function statusTone(status: ReceiptStatus): TagTone {
  if (status === 'review') return 'warning';
  if (status === 'failed') return 'danger';
  if (status === 'confirmed') return 'success';
  return 'info';
}
