import { useTranslation } from 'react-i18next';
import type { SessionBrowser, SessionSystem } from '@smartmat/shared';

/** "Firefox på Windows", "Ukjent nettleser på Android" (spec 13, FR-AUTH-009). */
export function useDeviceLabel() {
  const { t } = useTranslation();
  return (device: { browser: SessionBrowser; os: SessionSystem }) =>
    t('account.device', {
      browser: t(`account.browsers.${device.browser}`),
      os: t(`account.systems.${device.os}`),
    });
}
