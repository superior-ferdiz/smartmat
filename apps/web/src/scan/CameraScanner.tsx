import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeGtin, type ScanFormat } from '@smartmat/shared';
import { Alert } from '../components/Alert/Alert';
import { Button } from '../components/Button/Button';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { CAMERA_CONSTRAINTS, problemFromError, stopStream, type CameraProblem } from './camera';
import { createDetector, scanFormat } from './detector';
import styles from './scan.module.css';

/** How often a picture is checked for a barcode. Often enough to feel instant, rare enough to save battery. */
const SCAN_INTERVAL_MS = 200;

interface CameraScannerProps {
  /** A code with a valid check digit was read. The camera is already stopped. */
  onDetected: (code: string, format?: ScanFormat) => void;
  onClose: () => void;
}

type State =
  { kind: 'starting' } | { kind: 'scanning' } | { kind: 'problem'; problem: CameraProblem };

/**
 * FR-SCAN-001. Loaded only when the user starts the camera (React.lazy in ScanPage). The picture is only used
 * here, in the browser; only the code that was read is passed on.
 */
export function CameraScanner({ onDetected, onClose }: CameraScannerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const detectedRef = useRef(onDetected);
  useEffect(() => {
    detectedRef.current = onDetected;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      stopStream(stream);
      stream = null;
    };
    // Stop when the tab is hidden (spec 07): the camera light should not stay on in the background.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        onClose();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    async function start() {
      try {
        const [{ detector }, media] = await Promise.all([
          createDetector(),
          navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS),
        ]);
        stream = media;
        if (stopped) return stop();
        const video = videoRef.current;
        if (!video) return stop();
        video.srcObject = media;
        await video.play();
        setState({ kind: 'scanning' });

        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              for (const code of await detector.detect(video)) {
                const format = scanFormat(code.format);
                // A misread (wrong check digit) is ignored; the next picture is usually right.
                if (normalizeGtin(code.rawValue, format).ok) {
                  stop();
                  detectedRef.current(code.rawValue, format);
                  return;
                }
              }
            }
          } catch {
            // One picture that could not be read is not an error; keep looking.
          }
          timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
        };
        void tick();
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

  if (state.kind === 'problem') {
    return (
      <div className={styles.camera}>
        <Alert variant="warning" live title={t(`scan.camera.problems.${state.problem}.title`)}>
          {t(`scan.camera.problems.${state.problem}.text`)} {t('scan.camera.typeInstead')}
        </Alert>
        <div className={styles.buttons}>
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
      <div className={styles.viewfinder} hidden={state.kind !== 'scanning'}>
        <video
          ref={videoRef}
          className={styles.video}
          muted
          playsInline
          aria-label={t('scan.camera.videoLabel')}
        />
        <div className={styles.frame} aria-hidden="true" />
      </div>
      {state.kind === 'scanning' && (
        <p className={styles.hint} role="status">
          {t('scan.camera.scanning')}
        </p>
      )}
      <div className={styles.buttons}>
        <Button variant="secondary" onClick={onClose}>
          {t('scan.camera.stop')}
        </Button>
      </div>
    </div>
  );
}
