import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { Icon } from '../components/Icon/Icon';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { problemFromError, stopStream, type CameraProblem } from '../scan/camera';
import { RECEIPT_CAMERA_CONSTRAINTS } from './receiptForm';
import styles from '../pages/receipts/receipts.module.css';

interface ReceiptCameraProps {
  /** The photo was taken. The camera is already stopped. */
  onCapture: (photo: Blob) => void;
  /** The camera did not start: let the phone's own camera app (or a file) take over. */
  onFallback: () => void;
  onClose: () => void;
}

type State = { kind: 'starting' } | { kind: 'ready' } | { kind: 'problem'; problem: CameraProblem };

/**
 * FR-RCPT-001: the camera inside the page, for browsers that ignore `capture` on a file input (laptops, some
 * Android browsers) and only open a file picker. Nothing leaves the browser until the photo is taken.
 */
export function ReceiptCamera({ onCapture, onFallback, onClose }: ReceiptCameraProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<State>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stopped = false;
    const stop = () => {
      stopped = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
    // The camera light should not stay on in a hidden tab (as in spec 07).
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        onClose();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia(RECEIPT_CAMERA_CONSTRAINTS);
        streamRef.current = media;
        if (stopped) return stop();
        const video = videoRef.current;
        if (!video) return stop();
        video.srcObject = media;
        await video.play();
        setState({ kind: 'ready' });
      } catch (error) {
        stop();
        setState({ kind: 'problem', problem: problemFromError(error) });
      }
    }
    void start();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [attempt, onClose]);

  function shoot() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopStream(streamRef.current);
        streamRef.current = null;
        onCapture(blob);
      },
      'image/jpeg',
      0.92,
    );
  }

  if (state.kind === 'problem') {
    return (
      <div className={styles.camera}>
        <Alert variant="warning" live title={t(`scan.camera.problems.${state.problem}.title`)}>
          {t(`scan.camera.problems.${state.problem}.text`)} {t('receipts.camera.fallbackText')}
        </Alert>
        <div className={styles.uploadButtons}>
          <Button icon={<Icon name="camera" size={20} />} onClick={onFallback}>
            {t('receipts.camera.fallback')}
          </Button>
          {state.problem !== 'insecure' && state.problem !== 'unsupported' && (
            <Button
              variant="secondary"
              onClick={() => {
                setState({ kind: 'starting' });
                setAttempt((n) => n + 1);
              }}
            >
              {t('scan.camera.retry')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('scan.camera.close')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.camera}>
      {state.kind === 'starting' && <LoadingState label={t('scan.camera.starting')} />}
      <div className={styles.viewfinder} hidden={state.kind !== 'ready'}>
        <video
          ref={videoRef}
          className={styles.video}
          muted
          playsInline
          aria-label={t('scan.camera.videoLabel')}
        />
      </div>
      {state.kind === 'ready' && (
        <p className={styles.small} role="status">
          {t('receipts.camera.hint')}
        </p>
      )}
      <div className={styles.uploadButtons}>
        <Button
          icon={<Icon name="camera" size={20} />}
          disabled={state.kind !== 'ready'}
          onClick={shoot}
        >
          {t('receipts.camera.shoot')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('receipts.camera.cancel')}
        </Button>
      </div>
    </div>
  );
}
