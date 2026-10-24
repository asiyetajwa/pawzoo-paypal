import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from '../theme';
import { BlurText, Camera, cameraAt, clamp, Cursor, easeOut, popAt, type CamKey, type CursorKey } from '../components/motion';
import boxes from '../../public/pawzoo/boxes.json';

type SceneProps = { duration: number };
type Box = { x: number; y: number; w: number; h: number };
const B = boxes as unknown as Record<string, Box>;
const center = (key: string): [number, number] => {
  const b = B[key] ?? { x: 0, y: 0, w: 0, h: 0 };
  return [b.x + b.w / 2, b.y + b.h / 2];
};

/* ------------------------------------------------------------ the browser window */

// Captures are 1600 css px wide and as tall as the simulator's tallest answer (boxes.size.h);
// the window shows them 1400 world units wide.
const CAP = (boxes as unknown as { size: { w: number; h: number } }).size;
const WIN = { w: 1400, bar: 46 };
const S = WIN.w / CAP.w;
const winH = CAP.h * S + WIN.bar;
/** World position of a point on the capture (css px). */
const w = (x: number, y: number) => ({ x: -WIN.w / 2 + x * S, y: -winH / 2 + WIN.bar + y * S });

type State = { src: string; at: number };

function useLayers(states: State[]) {
  const frame = useCurrentFrame();
  return states.map((s, i) => {
    const next = states[i + 1];
    const opacity = i === 0 ? 1 : interpolate(frame, [s.at, s.at + 12], [0, 1], { ...clamp, easing: easeOut });
    const visible = frame >= s.at - 1 && (!next || frame < next.at + 14);
    return { ...s, opacity, visible };
  });
}

const Window: React.FC<{ states: State[]; url?: string }> = ({ states, url = '127.0.0.1:8787  ·  Pawzoo' }) => {
  const layers = useLayers(states);
  return (
    <div
      style={{
        position: 'absolute',
        left: -WIN.w / 2,
        top: -winH / 2,
        width: WIN.w,
        height: winH,
        borderRadius: 20,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 60px 120px rgba(31,27,46,0.22), 0 12px 32px rgba(31,27,46,0.10)',
      }}
    >
      <div style={{ height: WIN.bar, background: '#f4f4f7', borderBottom: '1px solid #e6e6ec', display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span key={c} style={{ width: 12, height: 12, borderRadius: 999, background: c }} />
        ))}
        <div style={{ margin: '0 auto', padding: '6px 70px', borderRadius: 9, background: '#ffffff', border: '1px solid #e6e6ec', color: theme.muted, fontFamily: theme.font, fontSize: 15, fontWeight: 500 }}>
          {url}
        </div>
      </div>
      <div style={{ position: 'relative', width: WIN.w, height: CAP.h * S, background: theme.bg }}>
        {layers.map((l) =>
          l.visible ? (
            <Img key={l.src} src={staticFile(`pawzoo/${l.src}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: l.opacity }} />
          ) : null,
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ helpers */

/** Camera key that centres a point of the capture at zoom z. */
const at = (f: number, x: number, y: number, z: number): CamKey => ({ f, ...w(x, y), z });
const WIDE = (f: number): CamKey => ({ f, x: 0, y: 0, z: 1.0 });
/** The whole simulator, a little closer, for clicking the suggestion chips. */
const NEAR = (f: number): CamKey => at(f, CAP.w / 2, CAP.h / 2, 1.06);
/**
 * Reads the answer in a capture: centres its box and zooms as close as fits the whole card, buttons
 * included (never closer than READ). `drift` eases in a touch over the hold.
 */
const read = (f: number, shot: string, drift = 0): CamKey => {
  const answer = B[`answer:${shot}`] ?? { x: 847, y: 237, w: 482, h: 480 };
  // Take in the heading above the answer too ("How was her day"), so no line is cut at the top.
  const headTop = 118;
  const b = { ...answer, y: headTop, h: answer.y + answer.h - headTop };
  // The card sits in the screen above the caption pill (bottom 180px), with a margin all round.
  const top = 40;
  const bottom = 1080 - 180;
  const z = Math.min(READ, (bottom - top) / ((b.h + 40) * S), (1920 * 0.9) / ((b.w + 120) * S)) + drift;
  const lift = (1080 / 2 - (top + bottom) / 2) / (z * S);
  return at(f, b.x + b.w / 2, b.y + b.h / 2 + lift, z);
};
/** Cursor key on a capture point. */
const cur = (f: number, x: number, y: number, click = false): CursorKey => ({ f, ...w(x, y), click });
const clickOn = (f: number, key: string): CursorKey => cur(f, ...center(key), true);
/** Closest zoom for reading a card. */
const READ = 1.95;

/**
 * While the camera reads a card, a soft white veil covers the screen left of the answer column, so
 * the big blob title is never shown sliced in half at the frame edge.
 */
const ReadVeil: React.FC<{ keys: CamKey[] }> = ({ keys }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const c = cameraAt(frame, keys);
  const answerLeft = w((B['answer:sim-food']?.x ?? 847) - 28, 0).x;
  const edge = width / 2 + (answerLeft - c.x) * c.z;
  const opacity = interpolate(c.z, [1.1, 1.35], [0, 1], clamp);
  if (opacity <= 0 || edge <= 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: edge,
          opacity,
          background: `linear-gradient(90deg, ${theme.bg} 0%, #ffffff ${String(Math.max(0, ((edge - 140) / edge) * 100))}%, rgba(255,255,255,0) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Small caption pill under the action, for the benefit the line names. */
const Callout: React.FC<{ text: string; at: number; outAt: number }> = ({ text, at: start, outAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = popAt(frame, fps, start, 15);
  const out = interpolate(frame, [outAt, outAt + 14], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 64, pointerEvents: 'none' }}>
      <div
        style={{
          padding: '16px 30px',
          borderRadius: 999,
          background: theme.text,
          color: '#fff',
          fontFamily: theme.font,
          fontSize: 34,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          opacity: p * (1 - out),
          transform: `translateY(${String((1 - p) * 24 + out * 12)}px)`,
          boxShadow: '0 20px 50px rgba(31,27,46,0.25)',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ PayPal's own checkout */

// PayPal's sandbox checkout, captured in the approval window (480 x 720 css px), shown as a window of its own.
const PP = { w: 480, h: 720, scale: 1.22, bar: 40 };
const ppW = PP.w * PP.scale;
const ppH = PP.h * PP.scale + PP.bar;

const PayPalWindow: React.FC<{ src: string }> = ({ src }) => (
  <div
    style={{
      position: 'absolute',
      left: -ppW / 2,
      top: -ppH / 2,
      width: ppW,
      height: ppH,
      borderRadius: 18,
      overflow: 'hidden',
      background: '#fff',
      boxShadow: '0 60px 120px rgba(31,27,46,0.28), 0 12px 32px rgba(31,27,46,0.12)',
    }}
  >
    <div style={{ height: PP.bar, background: '#f4f4f7', borderBottom: '1px solid #e6e6ec', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <span key={c} style={{ width: 11, height: 11, borderRadius: 999, background: c }} />
      ))}
      <div style={{ margin: '0 auto', color: theme.muted, fontFamily: theme.font, fontSize: 14, fontWeight: 500 }}>sandbox.paypal.com</div>
    </div>
    <Img src={staticFile(`pawzoo/${src}.png`)} style={{ display: 'block', width: ppW, height: PP.h * PP.scale }} />
  </div>
);
/** World position of a point on the PayPal capture (css px). */
const pp = (x: number, y: number) => ({ x: -ppW / 2 + x * PP.scale, y: -ppH / 2 + PP.bar + y * PP.scale });

/* ------------------------------------------------------------ scenes */

const Logo: React.FC<{ size: number }> = ({ size }) => <Img src={staticFile('logo.svg')} style={{ width: size, height: size, display: 'block' }} />;

export const IntroScene: React.FC<SceneProps> = ({ duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = popAt(frame, fps, 4, 13);
  const zoom = interpolate(frame, [0, duration], [1.04, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${String(zoom)})` }}>
      <div style={{ transform: `scale(${String(0.6 + p * 0.4)})`, opacity: p, marginBottom: 34 }}>
        <Logo size={150} />
      </div>
      <BlurText text="Pawzoo" at={12} outAt={duration - 18} style={{ fontFamily: theme.font, fontSize: 150, fontWeight: 800, letterSpacing: '-0.04em', color: theme.text, lineHeight: 1 }} />
      <div style={{ height: 26 }} />
      <BlurText text="Your dog's care, paid with PayPal. Only with your OK." at={34} outAt={duration - 16} style={{ fontFamily: theme.font, fontSize: 44, fontWeight: 400, color: theme.muted }} />
    </AbsoluteFill>
  );
};

export const NoticeScene: React.FC<SceneProps> = ({ duration }) => {
  const click = 58;
  const cam: CamKey[] = [WIDE(0), WIDE(click + 16), read(150, 'sim-food'), read(duration, 'sim-food', 0.05)];
  const cursor: CursorKey[] = [cur(0, 1250, 700), cur(46, ...center('chipFood')), clickOn(click, 'chipFood'), cur(click + 40, 600, 760)];
  return (
    <>
      <Camera keys={cam}>
        <Window states={[{ src: 'sim-start', at: 0 }, { src: 'sim-food', at: click + 8 }]} />
        <Cursor keys={cursor} visibleFrom={4} visibleTo={click + 60} />
      </Camera>
      <ReadVeil keys={cam} />
      <Callout text="She runs out Thursday" at={170} outAt={duration - 20} />
    </>
  );
};

export const ProposeScene: React.FC<SceneProps> = ({ duration }) => {
  const click = 44;
  const cam: CamKey[] = [NEAR(0), NEAR(click + 10), read(150, 'sim-propose'), read(duration, 'sim-propose', 0.05)];
  const cursor: CursorKey[] = [cur(0, 1150, 760), cur(34, ...center('chipReorder')), clickOn(click, 'chipReorder'), cur(click + 40, 1000, 760)];
  return (
    <>
      <Camera keys={cam}>
        <Window states={[{ src: 'sim-food', at: 0 }, { src: 'sim-propose', at: click + 8 }]} />
        <Cursor keys={cursor} visibleFrom={0} visibleTo={click + 50} />
      </Camera>
      <ReadVeil keys={cam} />
      <Callout text="The exact lines, tip included. Nothing bought yet" at={170} outAt={duration - 20} />
    </>
  );
};

export const OrderScene: React.FC<SceneProps> = ({ duration }) => {
  const click = 50;
  const cam: CamKey[] = [read(0, 'sim-propose'), read(click + 12, 'sim-propose'), read(130, 'sim-paypal'), read(duration, 'sim-paypal', 0.05)];
  const cursor: CursorKey[] = [cur(0, 1150, 700), cur(36, ...center('cardYes')), clickOn(click, 'cardYes'), cur(click + 40, 1100, 680)];
  return (
    <>
      <Camera keys={cam}>
        <Window states={[{ src: 'sim-propose', at: 0 }, { src: 'sim-paypal', at: click + 8 }]} />
        <Cursor keys={cursor} visibleFrom={0} visibleTo={click + 50} />
      </Camera>
      <ReadVeil keys={cam} />
      <Callout text="A PayPal order, via the Agent Toolkit. No money moves" at={140} outAt={duration - 20} />
    </>
  );
};

/** The person approves on PayPal's own checkout: the approval window opens over Pawzoo. */
const Approve: React.FC<{ duration: number; prefix: string; under: string }> = ({ duration, prefix, under }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const open = popAt(frame, fps, 8, 16);
  const payBox = B[`${prefix}:pay`] ?? { x: 32, y: 620, w: 416, h: 48 };
  const target = pp(payBox.x + payBox.w / 2, payBox.y + payBox.h / 2);
  const tap = Math.max(70, duration - 70);
  const cursor: CursorKey[] = [
    { f: 0, x: target.x + 260, y: target.y + 160 },
    { f: tap - 16, x: target.x, y: target.y },
    { f: tap, x: target.x, y: target.y, click: true },
    { f: duration, x: target.x + 30, y: target.y + 40 },
  ];
  const cam: CamKey[] = [{ f: 0, x: 0, y: 0, z: 1.0 }, { f: duration, x: 0, y: 40, z: 1.06 }];
  return (
    <>
      <Camera keys={cam}>
        <div style={{ position: 'absolute', left: 0, top: 0, transform: 'scale(0.78)', opacity: 0.55, filter: 'blur(2px)' }}>
          <Window states={[{ src: under, at: 0 }]} />
        </div>
        <div style={{ position: 'absolute', left: 0, top: 0, opacity: open, transform: `translateY(${String((1 - open) * 60)}px)` }}>
          <PayPalWindow src={`${prefix}-paypal`} />
        </div>
        <Cursor keys={cursor} visibleFrom={20} visibleTo={duration} />
      </Camera>
      <Callout text="You approve on PayPal" at={40} outAt={duration - 20} />
    </>
  );
};

export const ApproveScene: React.FC<SceneProps> = ({ duration }) => <Approve duration={duration} prefix="food" under="sim-paypal" />;

export const ReceiptScene: React.FC<SceneProps> = ({ duration }) => {
  const cam: CamKey[] = [read(0, 'sim-receipt', -0.15), read(90, 'sim-receipt'), read(duration, 'sim-receipt', 0.05)];
  return (
    <>
      <Camera keys={cam}>
        <Window states={[{ src: 'sim-paypal', at: 0 }, { src: 'sim-receipt', at: 6 }]} />
      </Camera>
      <ReadVeil keys={cam} />
      <Callout text="Captured only for the exact approved total" at={60} outAt={Math.round(duration * 0.5)} />
      <Callout text="The receipt: every line, the tip, the PayPal transaction" at={Math.round(duration * 0.5) + 16} outAt={duration - 20} />
    </>
  );
};

export const WalkScene: React.FC<SceneProps> = ({ duration }) => {
  const quote = 30;
  const approve = Math.round(duration * 0.45);
  const paid = Math.round(duration * 0.7);
  const cam: CamKey[] = [read(0, 'sim-walk'), read(quote + 10, 'sim-walk'), read(approve - 20, 'sim-walkquote'), read(paid + 20, 'sim-walkreceipt'), read(duration, 'sim-walkreceipt', 0.05)];
  const cursor: CursorKey[] = [cur(0, 1150, 760), cur(22, ...center('cardPayTip')), clickOn(quote, 'cardPayTip'), cur(quote + 40, 1100, 720)];
  return (
    <>
      <Camera keys={cam}>
        <Window states={[{ src: 'sim-walk', at: 0 }, { src: 'sim-walkquote', at: quote + 8 }, { src: 'sim-walkpaypal', at: approve }, { src: 'sim-walkreceipt', at: paid }]} />
        <Cursor keys={cursor} visibleFrom={0} visibleTo={quote + 50} />
      </Camera>
      <ReadVeil keys={cam} />
      <Callout text="A tip for Dana: one approval, one capture" at={60} outAt={paid - 10} />
      <Callout text="One receipt, both lines" at={paid + 10} outAt={duration - 20} />
    </>
  );
};

export const HistoryScene: React.FC<SceneProps> = ({ duration }) => {
  const click = 44;
  const cam: CamKey[] = [NEAR(0), NEAR(click + 10), read(140, 'sim-receipts'), read(duration, 'sim-receipts', 0.05)];
  const cursor: CursorKey[] = [cur(0, 1150, 760), cur(34, ...center('chipReceipts')), clickOn(click, 'chipReceipts'), cur(click + 40, 1000, 760)];
  return (
    <>
      <Camera keys={cam}>
        <Window states={[{ src: 'sim-walkreceipt', at: 0 }, { src: 'sim-receipts', at: click + 8 }]} />
        <Cursor keys={cursor} visibleFrom={0} visibleTo={click + 50} />
      </Camera>
      <ReadVeil keys={cam} />
      <Callout text="Every refill, every tip, for Biscuit" at={150} outAt={duration - 20} />
    </>
  );
};

export const OutroScene: React.FC<SceneProps> = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = popAt(frame, fps, 2, 13);
  const lines = ['It proposes.', 'You approve.', 'PayPal pays.'];
  const lineAt = [60, 100, 140];
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: theme.font, color: theme.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: p, transform: `translateY(${String((1 - p) * 20)}px)` }}>
        <Logo size={110} />
        <span style={{ fontSize: 110, fontWeight: 800, letterSpacing: '-0.04em' }}>Pawzoo</span>
      </div>
      <div style={{ display: 'flex', gap: 26, marginTop: 40 }}>
        {lines.map((l, i) => (
          <BlurText key={l} text={l} at={lineAt[i] ?? 0} style={{ fontSize: 50, fontWeight: 600, letterSpacing: '-0.02em', color: [theme.text, theme.text, theme.violet][i] }} />
        ))}
      </div>
      <div style={{ marginTop: 54, opacity: interpolate(frame, [190, 220], [0, 1], clamp), fontSize: 24, color: theme.muted, letterSpacing: '0.02em' }}>
        MCP server  ·  PayPal Agent Toolkit  ·  Orders v2  ·  Claude Haiku 5.5
      </div>
      <div style={{ position: 'absolute', bottom: 40, opacity: interpolate(frame, [210, 240], [0, 1], clamp), fontSize: 18, color: theme.muted }}>
        Real PayPal sandbox payments. The household, dog and purchases in this film are fictional.
      </div>
    </AbsoluteFill>
  );
};
