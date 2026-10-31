import { SCAN_FORMATS, type ScanFormat } from '@smartmat/shared';

/*
 * FR-SCAN-001: reads barcodes from the camera picture, in the browser only (no picture leaves the device).
 * The browser's own BarcodeDetector is used where it exists and can read EAN-13 (Chrome on Android, Safari on
 * macOS). Elsewhere (iPhone, Firefox, Chrome on Windows/Linux) the fallback is loaded: `barcode-detector`
 * (MIT) on top of `zxing-wasm` (MIT). Both are dynamic imports, so they are only downloaded when the camera is
 * started, and the .wasm file comes from our own server – the library's default would load it from jsDelivr.
 */

export interface DetectedCode {
  rawValue: string;
  format: string;
}

export interface Detector {
  detect(source: HTMLVideoElement): Promise<DetectedCode[]>;
}

/** The parts of the (not yet standard) BarcodeDetector API we use. */
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

export type DetectorKind = 'native' | 'fallback';

function nativeDetector(): BarcodeDetectorClass | null {
  const candidate = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  return typeof candidate === 'function' ? candidate : null;
}

export async function createDetector(): Promise<{ detector: Detector; kind: DetectorKind }> {
  const native = nativeDetector();
  if (native) {
    const supported = await native.getSupportedFormats().catch(() => [] as string[]);
    if (supported.includes('ean_13')) {
      const formats = SCAN_FORMATS.filter((f) => supported.includes(f));
      return { detector: new native({ formats }), kind: 'native' };
    }
  }

  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasmUrl : prefix + path,
    },
    fireImmediately: false,
  });
  return {
    detector: new BarcodeDetector({ formats: [...SCAN_FORMATS] }) as unknown as Detector,
    kind: 'fallback',
  };
}

/** The format as our GTIN rules know it (only UPC-E changes how the digits are read). */
export function scanFormat(format: string): ScanFormat | undefined {
  return (SCAN_FORMATS as readonly string[]).includes(format) ? (format as ScanFormat) : undefined;
}
