// STUB — replaced by the share agent. Keep the export names/signatures.
import type { IGame, RunResult } from '../types';

/** Compose the 1080×1920 story card (best-trick frame + score + branding) as a PNG blob. */
export async function createShareCard(_game: IGame, _result: RunResult): Promise<Blob | null> {
  return null;
}

/** Web Share API with the file; falls back to downloading the PNG. Returns how it was delivered. */
export async function shareOrDownload(_blob: Blob, _result: RunResult): Promise<'shared' | 'downloaded' | 'cancelled'> {
  return 'cancelled';
}
