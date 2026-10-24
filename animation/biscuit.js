// Biscuit and her house, drawn in code. Isometric, thin navy outlines, flat pastel fills.
// Original artwork for Pawzoo. window.draw(sceneName, t) paints one frame at time t (seconds).

const C = document.getElementById('c');
const g = C.getContext('2d');
const W = C.width;
const H = C.height;

const P = {
  line: '#2a2547',
  lavender: '#c9c3fb',
  lavenderTop: '#d9d4ff',
  lavenderSide: '#a99ff0',
  lavenderDark: '#8f84e3',
  mint: '#9cf0c4',
  mintDark: '#6fd9a5',
  pink: '#f58cbf',
  pinkDark: '#e06aa5',
  yellow: '#fbd765',
  yellowDark: '#f0b93b',
  peach: '#ffcfa8',
  white: '#fffdf8',
  cream: '#f7e3c9',
  earInner: '#f9b9cf',
  sky: '#bfe6ff',
  wood: '#e9c39b',
  woodDark: '#cf9f72',
  grass: '#a7ec9a',
  grassDark: '#7fd77a',
};

const LW = 3;
const S = 46; // pixels per iso unit
let OX = W / 2;
let OY = 170;

function iso(x, y, z = 0) {
  return [OX + (x - y) * S * 0.866, OY + (x + y) * S * 0.5 - z * S];
}

function poly(points, fill, stroke = true) {
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = LW;
    g.lineJoin = 'round';
    g.strokeStyle = P.line;
    g.stroke();
  }
}

/** An isometric box from (x, y, z) with size (w, d, h): top, left and right faces. */
function box(x, y, z, w, d, h, top, left, right) {
  const A = iso(x, y + d, z);
  const B = iso(x + w, y + d, z);
  const Cc = iso(x + w, y, z);
  const A2 = iso(x, y + d, z + h);
  const B2 = iso(x + w, y + d, z + h);
  const C2 = iso(x + w, y, z + h);
  const D2 = iso(x, y, z + h);
  poly([A, B, B2, A2], left);
  poly([B, Cc, C2, B2], right);
  poly([D2, A2, B2, C2], top);
}

function floorTiles(x0, y0, w, d, a, b) {
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      const c = (i + j) % 2 ? a : b;
      poly([iso(x0 + i, y0 + j), iso(x0 + i + 1, y0 + j), iso(x0 + i + 1, y0 + j + 1), iso(x0 + i, y0 + j + 1)], c);
    }
  }
}

/** A left wall (along y) and a back wall (along x), drawn as thin boxes. */
function walls(w, d, h, color, side) {
  box(0, -0.3, 0, w, 0.3, h, P.lavenderTop, color, side);
  box(-0.3, -0.3, 0, 0.3, d + 0.3, h, P.lavenderTop, side, color);
}

function circle(x, y, r, fill, stroke = true) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = LW;
    g.strokeStyle = P.line;
    g.stroke();
  }
}

/** A fluffy shape: circles stroked first, then filled again so only the outside outline stays. */
function fluff(circles, fill = P.white) {
  for (const [x, y, r] of circles) circle(x, y, r + 0.5, fill, true);
  for (const [x, y, r] of circles) circle(x, y, r - LW / 2, fill, false);
}

function ellipse(x, y, rx, ry, fill, rot = 0, stroke = true) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = LW;
    g.strokeStyle = P.line;
    g.stroke();
  }
}

function shadow(x, y, rx) {
  g.save();
  g.globalAlpha = 0.18;
  ellipse(x, y, rx, rx * 0.32, P.line, 0, false);
  g.restore();
}

function sparkle(x, y, r, t) {
  const k = 0.6 + 0.4 * Math.sin(t * 6);
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    g.lineTo(Math.cos(a + Math.PI / 4) * r * 0.28, Math.sin(a + Math.PI / 4) * r * 0.28);
  }
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------- Biscuit

/**
 * Biscuit: a fluffy white corgi mix with tall ears, short legs, a curly tail and a yellow collar.
 * (x, y) is the point on the floor under her chest. s scales her. facing 1 = right, -1 = left.
 * pose: 'sit' | 'loaf' | 'sleep' | 'stand' | 'run' | 'stretch' | 'eat' | 'jump'
 */
function biscuit(x, y, s, pose, t, facing = 1, opts = {}) {
  g.save();
  g.translate(x, y);
  g.scale(s * facing, s);
  const breathe = Math.sin(t * 2.4) * 1.2;
  const wag = Math.sin(t * (pose === 'run' || pose === 'jump' ? 22 : 9));
  const hop = pose === 'run' ? -Math.abs(Math.sin(t * 11)) * 10 : pose === 'jump' ? -Math.abs(Math.sin(t * 6)) * 34 : 0;

  shadow(0, 0, pose === 'loaf' || pose === 'sleep' ? 58 : 50);
  g.translate(0, hop);

  const legs = (positions) => {
    for (const [lx, ly, len] of positions) {
      g.beginPath();
      g.roundRect(lx - 8, ly - len, 16, len + 2, 8);
      g.fillStyle = P.white;
      g.fill();
      g.lineWidth = LW;
      g.strokeStyle = P.line;
      g.stroke();
    }
  };

  const tail = (tx, ty, curl) => {
    fluff([
      [tx, ty, 10],
      [tx - 6, ty - 14 - curl, 11],
      [tx + 4, ty - 26 - curl, 9],
      [tx + 14, ty - 28 - curl * 1.4, 7],
    ]);
  };

  const head = (hx, hy, mood) => {
    // ears first so the head covers their base
    const earTilt = mood === 'sleep' ? 0.5 : Math.sin(t * 3) * 0.05;
    for (const side of [-1, 1]) {
      g.save();
      g.translate(hx + side * 16, hy - 18);
      g.rotate(side * (0.38 + earTilt));
      // broad corgi ear with a rounded tip
      g.beginPath();
      g.moveTo(-15, 6);
      g.quadraticCurveTo(-8, -18, -2, -27);
      g.quadraticCurveTo(1, -31, 4, -27);
      g.quadraticCurveTo(11, -16, 15, 6);
      g.closePath();
      g.fillStyle = P.cream;
      g.fill();
      g.lineWidth = LW;
      g.lineJoin = 'round';
      g.strokeStyle = P.line;
      g.stroke();
      g.beginPath();
      g.moveTo(-8, 4);
      g.quadraticCurveTo(-3, -12, 1, -18);
      g.quadraticCurveTo(5, -10, 8, 4);
      g.closePath();
      g.fillStyle = P.earInner;
      g.fill();
      g.restore();
    }
    fluff([
      [hx, hy, 27],
      [hx - 22, hy + 8, 12],
      [hx + 22, hy + 8, 12],
      [hx - 14, hy + 18, 11],
      [hx + 14, hy + 18, 11],
      [hx, hy + 21, 12],
      [hx - 6, hy - 22, 9],
      [hx + 8, hy - 21, 8],
    ]);
    // face, turned toward the viewer's right
    const fx = hx + 6;
    if (mood === 'sleep') {
      g.lineWidth = LW;
      g.strokeStyle = P.line;
      g.beginPath();
      g.arc(fx - 10, hy + 2, 5, 0.2, Math.PI - 0.2);
      g.stroke();
      g.beginPath();
      g.arc(fx + 10, hy + 2, 5, 0.2, Math.PI - 0.2);
      g.stroke();
    } else {
      const blink = Math.sin(t * 1.3) > 0.97 ? 0.2 : 1;
      ellipse(fx - 10, hy, 3.6, 3.6 * blink, P.line, 0, false);
      ellipse(fx + 10, hy, 3.6, 3.6 * blink, P.line, 0, false);
      circle(fx - 9, hy - 1.4, 1.1 * blink, '#fff', false);
      circle(fx + 11, hy - 1.4, 1.1 * blink, '#fff', false);
    }
    ellipse(fx, hy + 9, 4.6, 3.2, P.line, 0, false);
    g.lineWidth = 2.4;
    g.strokeStyle = P.line;
    g.beginPath();
    g.arc(fx - 3.5, hy + 13, 3.5, 0.1, Math.PI - 0.6);
    g.stroke();
    g.beginPath();
    g.arc(fx + 3.5, hy + 13, 3.5, 0.6, Math.PI - 0.1);
    g.stroke();
    if (mood === 'happy') {
      g.beginPath();
      g.ellipse(fx, hy + 19, 4, 6, 0, 0, Math.PI);
      g.fillStyle = P.pink;
      g.fill();
      g.lineWidth = 2;
      g.stroke();
    }
    // blush
    g.save();
    g.globalAlpha = 0.55;
    ellipse(fx - 18, hy + 9, 5, 3, P.earInner, 0, false);
    ellipse(fx + 18, hy + 9, 5, 3, P.earInner, 0, false);
    g.restore();
  };

  const collar = (cx, cy, w) => {
    g.beginPath();
    g.roundRect(cx - w / 2, cy - 4, w, 9, 4);
    g.fillStyle = P.yellow;
    g.fill();
    g.lineWidth = LW;
    g.strokeStyle = P.line;
    g.stroke();
    circle(cx + 4, cy + 10, 5, P.yellowDark);
  };

  switch (pose) {
    case 'sit': {
      tail(-38, -22, wag * 3);
      legs([[ -16, 0, 26 ], [ 18, 0, 26 ]]);
      fluff([[ -10, -40 + breathe, 30 ], [ 12, -36 + breathe, 28 ], [ -26, -20, 20 ], [ 22, -16, 20 ], [ 0, -14, 22 ]]);
      collar(10, -64 + breathe, 40);
      head(10, -90 + breathe, opts.mood);
      break;
    }
    case 'stand':
    case 'run': {
      const step = pose === 'run' ? Math.sin(t * 22) * 10 : Math.sin(t * 6) * 3;
      tail(-56, -40, wag * 4);
      legs([[ -40 - step, 0, 22 ], [ -24 + step, 0, 22 ], [ 22 - step, 0, 22 ], [ 38 + step, 0, 22 ]]);
      fluff([[ -34, -34, 24 ], [ -10, -38 + breathe, 26 ], [ 16, -38 + breathe, 26 ], [ 34, -34, 22 ], [ 0, -24, 22 ]]);
      collar(38, -54, 34);
      head(46, -78 + breathe, opts.mood ?? (pose === 'run' ? 'happy' : undefined));
      break;
    }
    case 'jump': {
      tail(-44, -46, wag * 4);
      legs([[ -30, -4, 22 ], [ 30, -10, 22 ]]);
      fluff([[ -24, -44, 24 ], [ 0, -48, 26 ], [ 22, -52, 24 ], [ 0, -30, 22 ]]);
      collar(26, -72, 34);
      head(34, -98, 'happy');
      break;
    }
    case 'eat': {
      tail(-52, -42, wag * 3);
      legs([[ -36, 0, 22 ], [ -20, 0, 22 ], [ 20, 0, 22 ], [ 34, 0, 22 ]]);
      fluff([[ -30, -38, 24 ], [ -6, -40, 26 ], [ 18, -36, 24 ], [ 0, -24, 22 ]]);
      collar(34, -40, 30);
      head(48, -40 + Math.sin(t * 9) * 3, undefined);
      break;
    }
    case 'stretch': {
      // play bow: front low, back high
      tail(-48, -62, wag * 3);
      legs([[ -34, 0, 34 ], [ -20, 0, 34 ], [ 24, 0, 12 ], [ 40, 0, 12 ]]);
      fluff([[ -30, -50, 24 ], [ -6, -42, 24 ], [ 18, -28, 22 ], [ 0, -36, 20 ]]);
      collar(34, -26, 30);
      head(46, -38, 'happy');
      break;
    }
    case 'loaf':
    case 'sleep': {
      tail(-58, -10, pose === 'sleep' ? 0 : wag * 2);
      fluff([[ -40, -20 + breathe, 22 ], [ -14, -26 + breathe, 28 ], [ 14, -24 + breathe, 26 ], [ 34, -16, 18 ], [ 0, -10, 22 ], [ -30, -6, 16 ]]);
      // front paws
      ellipse(44, -2, 12, 7, P.white);
      ellipse(60, -2, 12, 7, P.white);
      collar(38, -38, 30);
      head(46, -56 + breathe * 0.6, pose === 'sleep' ? 'sleep' : opts.mood);
      if (pose === 'sleep') {
        g.fillStyle = P.line;
        g.font = 'bold 22px Arial';
        const zt = (t * 0.8) % 1;
        g.globalAlpha = 1 - zt;
        g.fillText('z', 76 + zt * 16, -96 - zt * 30);
        g.globalAlpha = 1 - ((zt + 0.5) % 1);
        g.fillText('Z', 84 + ((zt + 0.5) % 1) * 18, -110 - ((zt + 0.5) % 1) * 34);
        g.globalAlpha = 1;
      }
      break;
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- People (simple, faceless, friendly)

function person(x, y, s, shirt, t, walking = false, opts = {}) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  shadow(0, 0, 34);
  const step = walking ? Math.sin(t * 8) * 8 : 0;
  // legs
  for (const [lx, d] of [[-10, step], [10, -step]]) {
    g.beginPath();
    g.roundRect(lx - 7 + d * 0.4, -70, 14, 70, 7);
    g.fillStyle = opts.pants ?? P.lavenderDark;
    g.fill();
    g.lineWidth = LW;
    g.strokeStyle = P.line;
    g.stroke();
  }
  // body
  g.beginPath();
  g.roundRect(-24, -138, 48, 76, 20);
  g.fillStyle = shirt;
  g.fill();
  g.lineWidth = LW;
  g.strokeStyle = P.line;
  g.stroke();
  // arm
  g.beginPath();
  g.roundRect(14, -128 + (walking ? Math.sin(t * 8) * 4 : 0), 13, 54, 7);
  g.fillStyle = shirt;
  g.fill();
  g.stroke();
  // head
  circle(0, -160, 22, opts.skin ?? '#f2c9a5');
  g.beginPath();
  g.arc(0, -166, 22, Math.PI, 0);
  g.lineTo(22, -164);
  g.closePath();
  g.fillStyle = opts.hair ?? P.line;
  g.fill();
  g.stroke();
  if (opts.cap) {
    g.beginPath();
    g.roundRect(-4, -184, 34, 10, 5);
    g.fillStyle = opts.cap;
    g.fill();
    g.stroke();
  }
  ellipse(7, -156, 2.6, 2.6, P.line, 0, false);
  g.restore();
}

// ---------------------------------------------------------------- Rooms

function hud(camera, time) {
  g.save();
  g.fillStyle = 'rgba(42,37,71,.55)';
  g.beginPath();
  g.roundRect(24, 22, 300, 44, 22);
  g.fill();
  circle(48, 44, 7, '#ff5c7a', false);
  g.fillStyle = '#fff';
  g.font = '600 20px Outfit, Arial';
  g.fillText(camera, 64, 51);
  g.beginPath();
  g.roundRect(W - 168, 22, 144, 44, 22);
  g.fillStyle = 'rgba(42,37,71,.55)';
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'right';
  g.fillText(time, W - 46, 51);
  g.restore();
}

function vignette() {
  const grd = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(42,37,71,.35)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
}

function livingRoom(t, extras = () => {}) {
  g.fillStyle = P.lavender;
  g.fillRect(0, 0, W, H);
  OX = W / 2 + 60;
  OY = 120;
  walls(10, 9, 4.2, P.lavenderSide, P.lavenderDark);
  // window on back wall with sky
  const win = [iso(5.6, -0.3, 1.4), iso(8.6, -0.3, 1.4), iso(8.6, -0.3, 3.4), iso(5.6, -0.3, 3.4)];
  poly(win, P.sky);
  g.lineWidth = LW;
  g.beginPath();
  const m1 = iso(7.1, -0.3, 1.4);
  const m2 = iso(7.1, -0.3, 3.4);
  g.moveTo(...m1);
  g.lineTo(...m2);
  g.stroke();
  floorTiles(0, 0, 10, 9, P.lavenderTop, '#d0caff');
  // rug
  poly([iso(2, 3.2), iso(7.4, 3.2), iso(7.4, 7.6), iso(2, 7.6)], P.mint);
  poly([iso(2.5, 3.7), iso(6.9, 3.7), iso(6.9, 7.1), iso(2.5, 7.1)], P.mintDark, false);
  // couch against the left wall
  box(0, 1.2, 0, 2.2, 5.2, 1.1, P.pink, P.pinkDark, '#d45b97');
  box(0, 1.2, 1.1, 0.7, 5.2, 1.2, P.pink, P.pinkDark, '#d45b97');
  box(0.7, 1.2, 1.1, 1.5, 0.6, 0.6, P.pink, P.pinkDark, '#d45b97');
  box(0.7, 5.8, 1.1, 1.5, 0.6, 0.6, P.pink, P.pinkDark, '#d45b97');
  // picture frame on the left wall and a floor lamp
  poly([iso(-0.3, 7, 2), iso(-0.3, 8.4, 2), iso(-0.3, 8.4, 3.2), iso(-0.3, 7, 3.2)], P.yellow);
  poly([iso(-0.3, 7.25, 2.2), iso(-0.3, 8.15, 2.2), iso(-0.3, 8.15, 3), iso(-0.3, 7.25, 3)], P.sky, false);
  box(9.2, 0.6, 0, 0.3, 0.3, 2.6, P.line, P.lavenderDark, P.line);
  box(8.85, 0.25, 2.6, 1, 1, 0.7, P.yellow, P.yellowDark, '#e2a92c');
  // dog bed and a toy ball on the rug
  ellipse(...iso(7.4, 5.6), 62, 30, P.pink);
  ellipse(...iso(7.4, 5.6), 44, 19, '#ffd3e6', 0, false);
  const [tx, ty] = iso(3.2, 7.2);
  circle(tx, ty - 12, 13, P.yellow);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(tx, ty - 12, 13, -0.6, 0.9);
  g.stroke();
  // plant
  box(8.6, 7.4, 0, 0.9, 0.9, 0.9, P.yellow, P.yellowDark, '#e2a92c');
  for (let i = 0; i < 5; i++) {
    const [px, py] = iso(9.05, 7.85, 0.9);
    g.save();
    g.translate(px, py);
    g.rotate(-0.8 + i * 0.4 + Math.sin(t * 1.5 + i) * 0.04);
    ellipse(0, -36, 9, 34, P.mintDark);
    g.restore();
  }
  extras();
}

function kitchen(t, extras = () => {}) {
  g.fillStyle = P.mint;
  g.fillRect(0, 0, W, H);
  OX = W / 2 + 40;
  OY = 130;
  walls(10, 9, 4.2, P.mintDark, '#58c491');
  floorTiles(0, 0, 10, 9, '#fff4e6', '#ffe8cf');
  // counters along the back wall
  box(0.2, 0, 0, 6, 1.4, 1.9, '#fff', P.lavenderSide, P.lavenderDark);
  box(6.2, 0, 0, 1.6, 1.4, 1.9, '#fff', P.pink, P.pinkDark);
  // fridge
  box(8, 0, 0, 1.8, 1.6, 3.6, '#ffffff', '#e6e2ff', P.lavenderSide);
  extras();
}

function porch(t, extras = () => {}) {
  g.fillStyle = P.grass;
  g.fillRect(0, 0, W, H);
  OX = W / 2 + 40;
  OY = 110;
  // house front along the back
  box(0, -0.4, 0, 11, 0.4, 5, P.peach, '#f2b88a', '#e2a273');
  // door
  const door = [iso(4, -0.4, 0), iso(6, -0.4, 0), iso(6, -0.4, 3.2), iso(4, -0.4, 3.2)];
  poly(door, P.pink);
  circle(...iso(5.6, -0.4, 1.5), 5, P.yellow);
  // doorbell camera
  const [bx, by] = iso(6.5, -0.4, 1.9);
  g.beginPath();
  g.roundRect(bx - 8, by - 18, 16, 34, 8);
  g.fillStyle = P.line;
  g.fill();
  circle(bx, by - 8, 4, P.sky, false);
  // porch deck and steps
  floorTiles(0, 0, 11, 4, P.wood, '#f0cfa9');
  box(3, 4, -0.5, 4, 1, 0.5, P.wood, P.woodDark, '#b98758');
  // path across the lawn, with flower beds
  poly([iso(3.4, 5), iso(6.6, 5), iso(6.6, 12), iso(3.4, 12)], '#f4e9dc');
  for (const [fx, fy, c] of [[1.2, 6.2, P.pink], [1.8, 7.4, P.yellow], [8.6, 6.4, P.pink], [9.4, 7.6, P.yellow], [8.2, 8.8, '#ffffff']]) {
    const [x, y] = iso(fx, fy);
    for (let i = 0; i < 5; i++) circle(x + Math.cos(i * 1.26) * 7, y - 8 + Math.sin(i * 1.26) * 7, 5, c);
    circle(x, y - 8, 4, P.yellowDark, false);
  }
  // doormat
  poly([iso(4.1, 0.4), iso(5.9, 0.4), iso(5.9, 1.6), iso(4.1, 1.6)], P.yellow);
  extras();
}

function backyard(t, extras = () => {}) {
  g.fillStyle = P.grass;
  g.fillRect(0, 0, W, H);
  OX = W / 2;
  OY = 110;
  // fence along the back
  for (let i = 0; i < 12; i++) box(i, -0.3, 0, 0.8, 0.3, 1.6, '#fff', P.cream, '#e8cfae');
  floorTiles(0, 0, 12, 10, P.grass, '#b5f2a8');
  // doghouse and a little tree
  box(0.4, 0.6, 0, 2, 2, 1.4, P.pink, P.pinkDark, '#d45b97');
  poly([iso(0.4, 0.6, 1.4), iso(0.4, 2.6, 1.4), iso(1.4, 2.6, 2.4), iso(1.4, 0.6, 2.4)], P.yellow);
  poly([iso(1.4, 0.6, 2.4), iso(2.4, 0.6, 1.4), iso(2.4, 2.6, 1.4), iso(1.4, 2.6, 2.4)], P.yellowDark);
  box(10.2, 1.2, 0, 0.4, 0.4, 1.6, P.woodDark, P.wood, P.woodDark);
  { const [x, y] = iso(10.4, 1.4, 2.4); fluff([[x, y, 34], [x - 26, y + 14, 24], [x + 26, y + 14, 24], [x, y - 24, 26]], P.mintDark); }
  for (const [fx, fy] of [[3, 8.5], [5.5, 9], [10, 8]]) {
    const [x, y] = iso(fx, fy);
    for (let i = 0; i < 5; i++) circle(x + Math.cos(i * 1.26) * 7, y - 8 + Math.sin(i * 1.26) * 7, 5, '#ffffff');
    circle(x, y - 8, 4, P.yellow, false);
  }
  // ball
  const [bx, by] = iso(9, 7, 0);
  circle(bx, by - 16, 16, P.yellow);
  extras();
}

// ---------------------------------------------------------------- Scenes

const SCENES = {
  sheet(t) {
    g.fillStyle = P.lavender;
    g.fillRect(0, 0, W, H);
    g.fillStyle = P.line;
    g.font = '800 44px Outfit, Arial';
    g.fillText('Biscuit', 60, 90);
    g.font = '400 22px Outfit, Arial';
    g.fillText('Corgi mix, fluffy, big ears, yellow collar. Original Pawzoo character.', 60, 126);
    const poses = [['sit', 'Sit'], ['stand', 'Stand'], ['run', 'Zoomies'], ['loaf', 'Loaf'], ['sleep', 'Nap'], ['jump', 'Happy']];
    poses.forEach(([pose, label], i) => {
      const x = 150 + (i % 3) * 400;
      const y = 380 + Math.floor(i / 3) * 280;
      biscuit(x, y, 1.25, pose, t);
      g.fillStyle = P.line;
      g.font = '500 22px Outfit, Arial';
      g.fillText(label, x + 90, y + 6);
    });
  },
  wake(t) {
    livingRoom(t, () => {
      const [x, y] = iso(4.6, 5.4);
      biscuit(x, y, 1.15, t < 2.4 ? 'loaf' : 'stretch', t, 1, { mood: 'happy' });
      sparkle(x + 90, y - 120, 10, t);
    });
    hud('Living Room', '7:12 AM');
  },
  couch(t) {
    livingRoom(t, () => {
      const [x, y] = iso(1.2, 3.6, 1.1);
      biscuit(x, y, 1.05, 'loaf', t, 1, { mood: 'happy' });
      sparkle(x + 80, y - 100, 9, t + 1);
    });
    hud('Living Room', '11:20 AM');
  },
  nap(t) {
    livingRoom(t, () => {
      const [x, y] = iso(5, 6);
      biscuit(x, y, 1.15, 'sleep', t);
    });
    hud('Living Room', '1:05 PM');
  },
  'window-watch'(t) {
    livingRoom(t, () => {
      // delivery truck passing outside the window
      const k = (t / 4) % 1;
      const [ax, ay] = iso(5.6 + k * 3, -0.32, 1.5);
      g.save();
      g.beginPath();
      const w = [iso(5.6, -0.3, 1.4), iso(8.6, -0.3, 1.4), iso(8.6, -0.3, 3.4), iso(5.6, -0.3, 3.4)];
      w.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.clip();
      g.beginPath();
      g.roundRect(ax - 60, ay - 50, 120, 46, 8);
      g.fillStyle = '#fff';
      g.fill();
      g.lineWidth = LW;
      g.strokeStyle = P.line;
      g.stroke();
      g.restore();
      const [x, y] = iso(6.6, 1.2);
      biscuit(x, y, 1.15, 'stand', t, -1, { mood: 'happy' });
    });
    hud('Living Room', '3:32 PM');
  },
  meal(t) {
    kitchen(t, () => {
      const [bx, by] = iso(4.4, 4.6);
      ellipse(bx + 10, by - 6, 34, 14, P.pink);
      ellipse(bx + 10, by - 12, 26, 9, '#c88b55', 0, false);
      const [x, y] = iso(3.2, 4.9);
      biscuit(x, y, 1.15, 'eat', t);
      person(...iso(6.5, 3.2), 1, P.yellow, t, false, { hair: '#5a3a2a' });
    });
    hud('Kitchen', '7:31 AM');
  },
  'walker-arrive'(t) {
    porch(t, () => {
      const k = Math.min(1, t / 3);
      person(...iso(4.6, 8 - k * 6.4), 1.05, P.mint, t, k < 1, { cap: P.pink, skin: '#c98e6a' });
    });
    hud('Front Door', '8:04 AM');
  },
  'walk-start'(t) {
    porch(t, () => {
      const k = Math.min(1, t / 4.5);
      const py = 2 + k * 7;
      person(...iso(4.6, py), 1.05, P.mint, t, true, { cap: P.pink, skin: '#c98e6a' });
      const [dx, dy] = iso(5.8, py + 0.4);
      biscuit(dx, dy, 1, 'run', t, 1);
      // leash
      const [hx, hy] = iso(4.6, py);
      g.lineWidth = 3;
      g.strokeStyle = P.pinkDark;
      g.beginPath();
      g.moveTo(hx + 26, hy - 80);
      g.quadraticCurveTo(hx + 50, hy - 20, dx + 40, dy - 52);
      g.stroke();
    });
    hud('Front Door', '8:06 AM');
  },
  'walk-end'(t) {
    porch(t, () => {
      const k = Math.min(1, t / 4.5);
      const py = 9 - k * 7;
      person(...iso(4.6, py), 1.05, P.mint, t, k < 1, { cap: P.pink, skin: '#c98e6a' });
      const [dx, dy] = iso(5.8, py + 0.4);
      biscuit(dx, dy, 1, k < 1 ? 'run' : 'sit', t, -1, { mood: 'happy' });
    });
    hud('Front Door', '8:41 AM');
  },
  'walker-leave'(t) {
    porch(t, () => {
      const k = Math.min(1, t / 3);
      person(...iso(4.6, 2 + k * 7), 1.05, P.mint, t, true, { cap: P.pink, skin: '#c98e6a' });
    });
    hud('Front Door', '8:43 AM');
  },
  zoomies(t) {
    backyard(t, () => {
      const a = t * 1.6;
      const x = 6 + Math.cos(a) * 3.4;
      const y = 5 + Math.sin(a) * 2.6;
      const [px, py] = iso(x, y);
      biscuit(px, py, 1.1, 'run', t, Math.sin(a) > 0 ? -1 : 1);
    });
    hud('Backyard', '4:10 PM');
  },
  'family-home'(t) {
    porch(t, () => {
      const k = Math.min(1, t / 2.6);
      person(...iso(4.2, 8 - k * 5.2), 0.85, P.pink, t, k < 1, { hair: '#3b2a5a', skin: '#a8714f' });
      const [dx, dy] = iso(6.4, 1.2 + Math.min(1, t / 1.5) * 1.6);
      biscuit(dx, dy, 1.05, t > 2 ? 'jump' : 'run', t, -1);
      if (t > 2.6) {
        sparkle(dx - 20, dy - 150, 12, t);
        sparkle(dx + 60, dy - 120, 8, t + 0.5);
      }
    });
    hud('Front Door', '6:24 PM');
  },
  escape(t) {
    porch(t, () => {
      const k = Math.min(1, t / 4);
      const [dx, dy] = iso(5.2, 1 + k * 5);
      biscuit(dx, dy, 1.05, k < 1 ? 'stand' : 'sit', t, 1);
    });
    hud('Front Door', '2:20 PM');
  },
};

window.SCENES = Object.keys(SCENES);
window.draw = (name, t) => {
  g.save();
  g.clearRect(0, 0, W, H);
  g.textAlign = 'left';
  SCENES[name](t);
  if (name !== 'sheet') vignette();
  g.restore();
};
window.draw('sheet', 0.4);
