import { continueRender, delayRender, staticFile } from 'remotion';

// Pawzoo's product look: soft grey page, white board, violet and yellow accents, Outfit type.
export const theme = {
  bg: '#e7e7ec',
  card: '#ffffff',
  text: '#1f1b2e',
  muted: '#8a8698',
  violet: '#8b5cf6',
  violetSoft: '#a78bfa',
  yellow: '#fbbf24',
  coral: '#f43f5e',
  font: "'Outfit', system-ui, sans-serif",
} as const;

let fontsRequested = false;

/** Loads Outfit (SIL Open Font License) before the first frame renders. */
export function ensureFonts(): void {
  if (fontsRequested || typeof document === 'undefined') return;
  fontsRequested = true;
  const handle = delayRender('Loading fonts');
  new FontFace('Outfit', `url(${staticFile('fonts/outfit-variable.woff2')}) format('woff2')`, { weight: '300 800' })
    .load()
    .then((f) => {
      document.fonts.add(f);
    })
    .catch((err: unknown) => {
      console.error(err);
    })
    .finally(() => {
      continueRender(handle);
    });
}
