// Pawzoo PayPal film: scene order, voiceover lines and minimum on-screen time.
// The screens are stills of the real app and of PayPal's own sandbox checkout, from real sandbox payments
// (scripts/capture.mjs). Voiceover: npm run voiceover
// Written for the ear: numbers as words. <break time="0.4s" /> is an ElevenLabs pause tag.

export type SceneId = 'intro' | 'notice' | 'propose' | 'order' | 'approve' | 'receipt' | 'walk' | 'history' | 'outro';

export type SceneSpec = {
  id: SceneId;
  voiceover: string;
  /** Length in seconds the choreography needs; audio can only extend it. */
  minSeconds: number;
  /** A sound after the line, e.g. the closing bark (public/sfx, made with ElevenLabs Sound Effects). */
  after?: { file: string; gap: number; seconds: number; volume: number };
};

export const SCENES: SceneSpec[] = [
  { id: 'intro', voiceover: 'This is Pawzoo, now with PayPal. It looks after your dog, and it never spends a cent without your OK.', minSeconds: 5.0 },
  { id: 'notice', voiceover: "Pawzoo watches Biscuit's day on your home cameras and keeps count of her food. About fifteen cups left, so she runs out Thursday.", minSeconds: 7.0 },
  { id: 'propose', voiceover: 'Ask it to reorder, with a three dollar tip for the driver. You hear the exact lines first: the bag, the tip, sixty-one ninety-nine in all. Nothing is bought yet.', minSeconds: 8.0 },
  { id: 'order', voiceover: "Say yes, and Pawzoo creates a PayPal order through PayPal's Agent Toolkit, for exactly those lines. Still, no money moves.", minSeconds: 7.0 },
  { id: 'approve', voiceover: "You approve it on PayPal, in PayPal's own checkout.", minSeconds: 5.0 },
  { id: 'receipt', voiceover: 'PayPal sends you back, and Pawzoo checks the order with PayPal again. Only an approved order, for the exact total, is captured. Then the receipt: every line, the tip, the PayPal transaction, and when her next bag runs out.', minSeconds: 11.0 },
  { id: 'walk', voiceover: "Tips work the same way. Pay Dana for today's walk with a three dollar tip: one approval, one capture, and one receipt with both lines.", minSeconds: 9.0 },
  { id: 'history', voiceover: 'And every payment is kept, pet by pet. Every refill, every tip, every transaction, right where you can see it.', minSeconds: 7.0 },
  { id: 'outro', voiceover: 'Pawzoo. <break time="0.4s" /> It proposes, you approve, PayPal pays.', minSeconds: 5.0, after: { file: 'sfx/bark.mp3', gap: 0.35, seconds: 1.4, volume: 0.3 } },
];
