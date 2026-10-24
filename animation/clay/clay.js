// Biscuit's day in clay: soft matte figures and little dioramas, drawn with three.js.
// Original Pawzoo artwork. window.draw(sceneName, t) renders one frame at time t (seconds).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const W = 1280;
const H = 720;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// ------------------------------------------------------------------ clay

// A faint, blotchy bump: the hand-pressed look of real clay, without fingerprints.
function clayBump() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 2 + rand() * 9;
    const v = 118 + rand() * 20;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
    grd.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}
const BUMP = clayBump();
const mats = new Map();
function clay(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key)) {
    mats.set(
      key,
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(color),
        roughness: opts.roughness ?? 0.62,
        metalness: opts.metalness ?? 0,
        sheen: 0.35,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color('#ffffff'),
        clearcoat: opts.clearcoat ?? 0.04,
        bumpMap: opts.flat ? null : BUMP,
        bumpScale: 0.6,
      }),
    );
  }
  return mats.get(key);
}

const C = {
  bg: '#efeae4',
  white: '#f7f4ef',
  black: '#2a2624',
  tan: '#c99672',
  brown: '#8a5a3c',
  gold: '#d9a93f',
  skinMaya: '#a8714f',
  skinDana: '#e7c1a0',
  sage: '#8fa383',
  beige: '#e6dcc9',
  charcoal: '#3b3836',
  navy: '#4f5d86',
  green: '#3f8f6b',
  lavender: '#cfc8f2',
  lavenderDeep: '#b3a9ea',
  pink: '#f2a7c3',
  pinkDeep: '#e58bb0',
  peach: '#f7c9a3',
  mint: '#a9e6c8',
  sky: '#bfe3f7',
  wood: '#e3c09a',
  grass: '#b4e3a1',
  grassDeep: '#93d084',
  yellow: '#f6d36b',
  cream: '#f3e7d3',
};

function mesh(geo, color, opts) {
  const m = new THREE.Mesh(geo, clay(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const sphere = (r, color, opts) => mesh(new THREE.SphereGeometry(r, 40, 28), color, opts);
const capsule = (r, len, color, opts) => mesh(new THREE.CapsuleGeometry(r, len, 10, 24), color, opts);
const rbox = (w, h, d, r, color, opts) => mesh(new RoundedBoxGeometry(w, h, d, 5, r), color, opts);
const cyl = (rt, rb, h, color, opts) => mesh(new THREE.CylinderGeometry(rt, rb, h, 40), color, opts);
const torus = (r, tube, color, opts) => mesh(new THREE.TorusGeometry(r, tube, 18, 48), color, opts);
function place(o, x, y, z, s = 1) {
  o.position.set(x, y, z);
  if (s !== 1) o.scale.setScalar(s);
  return o;
}

// ------------------------------------------------------------------ Biscuit

/** Biscuit: white clay pup with tan patches, floppy tan ears, brown collar and a gold tag. */
function makeBiscuit() {
  const dog = new THREE.Group();
  const body = new THREE.Group();
  dog.add(body);
  const torso = capsule(0.32, 0.5, C.white);
  torso.rotation.z = Math.PI / 2;
  torso.position.y = 0.5;
  body.add(torso);
  // patches pressed onto the body
  for (const [x, y, z, s] of [[-0.15, 0.74, 0.12, 0.2], [0.2, 0.68, -0.2, 0.16], [-0.38, 0.6, -0.16, 0.13]]) {
    const p = sphere(1, C.tan);
    p.scale.set(s, s * 0.45, s);
    p.position.set(x, y, z);
    body.add(p);
  }
  const legs = [];
  for (const [x, z] of [[0.3, 0.17], [0.3, -0.17], [-0.3, 0.17], [-0.3, -0.17]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.38, z);
    const l = capsule(0.11, 0.22, C.white);
    l.position.y = -0.2;
    leg.add(l);
    body.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(-0.6, 0.6, 0);
  const tl = capsule(0.07, 0.22, C.white);
  tl.position.y = 0.14;
  tl.rotation.z = 0.5;
  tail.add(tl);
  const tipTail = sphere(0.08, C.tan);
  tipTail.position.set(-0.1, 0.3, 0);
  tail.add(tipTail);
  body.add(tail);

  const head = new THREE.Group();
  head.position.set(0.55, 0.95, 0);
  const skull = sphere(0.36, C.white);
  skull.scale.set(1, 0.92, 1.02);
  head.add(skull);
  const cheek = sphere(0.2, C.white);
  cheek.scale.set(1, 0.7, 1.1);
  cheek.position.set(0.24, -0.12, 0);
  head.add(cheek);
  const nose = sphere(0.075, C.black, { roughness: 0.35, clearcoat: 0.4 });
  nose.scale.set(1, 0.75, 1.1);
  nose.position.set(0.43, -0.06, 0);
  head.add(nose);
  const eyes = [];
  for (const z of [0.14, -0.14]) {
    const e = sphere(0.045, C.black, { roughness: 0.3, clearcoat: 0.5, flat: true });
    e.position.set(0.32, 0.06, z);
    head.add(e);
    eyes.push(e);
  }
  const ears = [];
  for (const z of [0.3, -0.3]) {
    const ear = new THREE.Group();
    ear.position.set(-0.02, 0.2, z);
    const e = sphere(1, C.tan);
    e.scale.set(0.13, 0.27, 0.07);
    e.position.y = -0.18;
    ear.add(e);
    ear.rotation.x = z > 0 ? 0.35 : -0.35;
    head.add(ear);
    ears.push(ear);
  }
  const spot = sphere(1, C.tan);
  spot.scale.set(0.16, 0.12, 0.14);
  spot.position.set(0.05, 0.24, -0.18);
  head.add(spot);
  body.add(head);

  const collar = torus(0.27, 0.05, C.brown);
  collar.position.set(0.42, 0.72, 0);
  collar.rotation.y = Math.PI / 2;
  collar.rotation.x = 0.35;
  body.add(collar);
  const tag = sphere(0.06, C.gold, { metalness: 0.55, roughness: 0.3 });
  tag.position.set(0.58, 0.5, 0);
  body.add(tag);

  dog.userData = { body, head, legs, tail, ears, eyes, torso };
  return dog;
}

/** Poses Biscuit. pose: stand | walk | run | sit | lie | sleep | eat | jump | stretch */
function poseBiscuit(dog, pose, t) {
  const { body, head, legs, tail, ears, eyes } = dog.userData;
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  head.position.set(0.55, 0.95, 0);
  legs.forEach((l) => {
    l.rotation.set(0, 0, 0);
    l.visible = true;
  });
  eyes.forEach((e) => e.scale.set(1, 1, 1));
  const breathe = Math.sin(t * 2.6) * 0.012;
  const wag = Math.sin(t * (pose === 'run' || pose === 'jump' ? 18 : 8));
  tail.rotation.set(wag * 0.5, 0, 0.2);
  ears.forEach((e, i) => (e.rotation.z = Math.sin(t * 3 + i) * 0.06));
  body.scale.set(1, 1 + breathe, 1);
  switch (pose) {
    case 'walk':
    case 'run': {
      const speed = pose === 'run' ? 14 : 8;
      const swing = pose === 'run' ? 0.7 : 0.4;
      legs.forEach((l, i) => (l.rotation.z = Math.sin(t * speed + (i % 2 === 0 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * swing));
      body.position.y = Math.abs(Math.sin(t * speed)) * (pose === 'run' ? 0.12 : 0.04);
      ears.forEach((e) => (e.rotation.z = -0.4 - Math.abs(Math.sin(t * speed)) * 0.3));
      head.rotation.z = 0.08;
      break;
    }
    case 'sit': {
      body.rotation.z = 0.5;
      body.position.set(-0.05, -0.05, 0);
      legs[2].rotation.z = -1.1;
      legs[3].rotation.z = -1.1;
      legs[0].rotation.z = -0.45;
      legs[1].rotation.z = -0.45;
      head.rotation.z = -0.45 + Math.sin(t * 1.4) * 0.05;
      head.rotation.x = Math.sin(t * 0.9) * 0.12;
      break;
    }
    case 'lie':
    case 'sleep': {
      body.position.y = -0.24;
      legs.forEach((l, i) => (l.rotation.z = i < 2 ? -1.45 : 1.45));
      head.position.set(0.58, 0.72, 0);
      head.rotation.z = -0.15;
      if (pose === 'sleep') {
        eyes.forEach((e) => e.scale.set(1.6, 0.25, 1));
        tail.rotation.set(0, 0, 1.2);
      }
      break;
    }
    case 'eat': {
      legs.forEach((l, i) => (l.rotation.z = Math.sin(t * 2 + i) * 0.03));
      head.position.set(0.66, 0.6 + Math.sin(t * 8) * 0.03, 0);
      head.rotation.z = -0.7;
      break;
    }
    case 'jump': {
      const k = Math.abs(Math.sin(t * 5.5));
      body.position.y = k * 0.55;
      body.rotation.z = 0.35;
      legs[0].rotation.z = 0.6;
      legs[1].rotation.z = 0.6;
      legs[2].rotation.z = -0.4;
      legs[3].rotation.z = -0.4;
      ears.forEach((e) => (e.rotation.z = -0.7));
      break;
    }
    case 'stretch': {
      body.rotation.z = -0.35;
      body.position.y = -0.05;
      legs[0].rotation.z = 1.0;
      legs[1].rotation.z = 1.0;
      head.rotation.z = 0.35;
      break;
    }
    default:
      head.rotation.x = Math.sin(t * 1.2) * 0.1;
  }
}

// ------------------------------------------------------------------ people

/**
 * A clay person in the style of the references: rounded body, sphere head, dot eyes and a small
 * line mouth. look: { skin, top, pants, hair, cap?, bun?, band? }
 */
function makePerson(look) {
  const p = new THREE.Group();
  const legs = [];
  for (const z of [0.15, -0.15]) {
    const leg = new THREE.Group();
    leg.position.set(0, 1.0, z);
    const l = capsule(0.18, 0.6, look.pants);
    l.position.y = -0.48;
    leg.add(l);
    const shoe = rbox(0.34, 0.14, 0.22, 0.06, C.cream);
    shoe.position.set(0.06, -0.92, 0);
    leg.add(shoe);
    p.add(leg);
    legs.push(leg);
  }
  const torso = rbox(0.7, 0.88, 0.62, 0.24, look.top);
  torso.position.y = 1.46;
  p.add(torso);
  const arms = [];
  for (const z of [0.42, -0.42]) {
    const arm = new THREE.Group();
    arm.position.set(0, 1.78, z);
    const a = capsule(0.11, 0.56, look.sleeve ?? look.skin);
    a.position.y = -0.36;
    arm.add(a);
    const hand = sphere(0.12, look.skin);
    hand.position.y = -0.72;
    arm.add(hand);
    p.add(arm);
    arms.push(arm);
  }
  const head = new THREE.Group();
  head.position.y = 2.42;
  head.scale.setScalar(1.28);
  head.add(sphere(0.4, look.skin));
  for (const z of [0.42, -0.42]) {
    const ear = sphere(0.09, look.skin);
    ear.position.set(-0.02, -0.02, z);
    head.add(ear);
  }
  for (const z of [0.15, -0.15]) {
    const e = sphere(0.05, C.black, { roughness: 0.3, clearcoat: 0.5, flat: true });
    e.position.set(0.37, 0.02, z);
    head.add(e);
  }
  const mouth = rbox(0.02, 0.025, 0.08, 0.01, C.black, { flat: true });
  mouth.position.set(0.395, -0.12, 0);
  head.add(mouth);
  const hair = sphere(0.42, look.hair);
  hair.scale.set(1, 0.62, 1.02);
  hair.position.set(-0.06, 0.2, 0);
  head.add(hair);
  if (look.bun) {
    for (const [y, x, z, r] of [[0.52, -0.08, 0, 0.2], [0.46, -0.1, 0.18, 0.16], [0.46, -0.1, -0.18, 0.16], [0.6, -0.1, 0.08, 0.14], [0.6, -0.1, -0.08, 0.14]]) {
      const b = sphere(r, look.hair);
      b.position.set(x, y, z);
      head.add(b);
    }
  }
  if (look.band) {
    const band = torus(0.4, 0.05, look.band);
    band.rotation.x = Math.PI / 2;
    band.rotation.z = 0.3;
    band.position.set(-0.03, 0.2, 0);
    band.scale.set(1, 1, 0.8);
    head.add(band);
  }
  if (look.cap) {
    const cap = sphere(0.43, look.cap);
    cap.scale.set(1, 0.55, 1);
    cap.position.set(-0.02, 0.24, 0);
    head.add(cap);
    const brim = rbox(0.36, 0.05, 0.62, 0.02, look.cap);
    brim.position.set(0.36, 0.22, 0);
    brim.rotation.z = -0.15;
    head.add(brim);
    const cloud = sphere(0.07, C.white);
    cloud.scale.set(1, 0.6, 1.6);
    cloud.position.set(0.3, 0.38, 0);
    head.add(cloud);
  }
  if (look.hood) {
    const hood = torus(0.3, 0.12, look.hood);
    hood.rotation.x = Math.PI / 2;
    hood.position.y = 1.92;
    hood.scale.setScalar(1.2);
    p.add(hood);
  }
  p.add(head);
  p.userData = { legs, arms, head, torso };
  return p;
}

function posePerson(p, pose, t) {
  const { legs, arms, head } = p.userData;
  legs.forEach((l) => (l.rotation.z = 0));
  arms.forEach((a) => a.rotation.set(0, 0, 0));
  head.rotation.set(0, 0, 0);
  p.position.y = 0;
  if (pose === 'walk') {
    const s = Math.sin(t * 7);
    legs[0].rotation.z = s * 0.45;
    legs[1].rotation.z = -s * 0.45;
    arms[0].rotation.z = -s * 0.35;
    arms[1].rotation.z = s * 0.35;
    p.position.y = Math.abs(Math.cos(t * 7)) * 0.04;
  } else if (pose === 'wave') {
    arms[0].rotation.x = -2.5 + Math.sin(t * 9) * 0.3;
  } else if (pose === 'reach') {
    arms[0].rotation.z = 0.9;
    arms[1].rotation.z = 0.9;
  } else {
    head.rotation.x = Math.sin(t * 0.8) * 0.06;
    arms[0].rotation.z = Math.sin(t * 1.3) * 0.04;
  }
}

const LOOKS = {
  dana: { skin: C.skinDana, top: C.charcoal, sleeve: C.charcoal, pants: C.navy, hair: '#e8cf8f', cap: C.green, hood: '#d9c3a2' },
  maya: { skin: C.skinMaya, top: C.sage, pants: C.beige, hair: '#2d2826', bun: true, band: '#a98466' },
  sam: { skin: '#d9a47e', top: C.yellow, sleeve: C.yellow, pants: '#6b7a9c', hair: '#5a3a2a' },
};

// ------------------------------------------------------------------ stage

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
const cam = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 100);
const hemi = new THREE.HemisphereLight('#ffffff', '#d8cfc6', 1.15);
scene.add(hemi);
const key = new THREE.DirectionalLight('#fff4e6', 2.1);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -12;
key.shadow.camera.right = 12;
key.shadow.camera.top = 12;
key.shadow.camera.bottom = -12;
key.shadow.radius = 6;
key.shadow.bias = -0.0006;
scene.add(key);
scene.add(key.target);
const fill = new THREE.DirectionalLight('#e8eeff', 0.6);
scene.add(fill);

let world = new THREE.Group();
scene.add(world);
const cache = {};

function reset() {
  scene.remove(world);
  world = new THREE.Group();
  scene.add(world);
}

/** Isometric-ish three-quarter view onto (x, y, z), `span` world units wide. */
function frame(x, y, z, span = 14) {
  const aspect = W / H;
  cam.left = (-span / 2);
  cam.right = span / 2;
  cam.top = span / 2 / aspect;
  cam.bottom = -span / 2 / aspect;
  cam.position.set(x + 12, y + 10, z + 12);
  cam.lookAt(x, y, z);
  cam.updateProjectionMatrix();
  key.position.set(x + 6, y + 14, z + 9);
  key.target.position.set(x, y, z);
  fill.position.set(x - 8, y + 6, z + 4);
}

/** The diorama base: a thick rounded slab. */
function base(w, d, color, edge = C.cream) {
  const slab = rbox(w, 0.5, d, 0.2, edge);
  slab.position.y = -0.25;
  world.add(slab);
  const top = rbox(w - 0.2, 0.08, d - 0.2, 0.04, color);
  top.position.y = 0.02;
  world.add(top);
}

function wallsBack(w, d, h, color) {
  const back = rbox(w, h, 0.3, 0.12, color);
  back.position.set(0, h / 2, -d / 2 + 0.15);
  world.add(back);
  const left = rbox(0.3, h, d, 0.12, color);
  left.position.set(-w / 2 + 0.15, h / 2, 0);
  world.add(left);
}

function plant(x, z, s = 1) {
  const g = new THREE.Group();
  g.add(place(cyl(0.32, 0.26, 0.6, C.yellow), 0, 0.3, 0));
  for (let i = 0; i < 6; i++) {
    const leaf = capsule(0.09, 0.5, C.green);
    leaf.position.set(Math.cos(i) * 0.12, 0.95, Math.sin(i) * 0.12);
    leaf.rotation.set(Math.sin(i * 2) * 0.5, 0, Math.cos(i * 2) * 0.5);
    g.add(leaf);
  }
  return place(g, x, 0, z, s);
}

function livingRoom() {
  base(12, 9, C.lavender);
  wallsBack(12, 9, 4.5, C.lavenderDeep);
  // window
  world.add(place(rbox(3.2, 2.1, 0.2, 0.1, C.white), 2.5, 2.6, -4.3));
  world.add(place(rbox(2.8, 1.7, 0.1, 0.05, C.sky, { flat: true }), 2.5, 2.6, -4.2));
  // rug and couch
  world.add(place(rbox(6, 0.06, 4, 0.03, C.mint), 0.2, 0.08, 0.8));
  const couch = new THREE.Group();
  couch.add(place(rbox(4.6, 0.9, 1.9, 0.35, C.pink), 0, 0.6, 0));
  couch.add(place(rbox(4.6, 1.4, 0.6, 0.3, C.pinkDeep), 0, 1.2, -0.75));
  couch.add(place(rbox(0.6, 1.2, 1.9, 0.28, C.pinkDeep), -2.3, 0.9, 0));
  couch.add(place(rbox(0.6, 1.2, 1.9, 0.28, C.pinkDeep), 2.3, 0.9, 0));
  world.add(place(couch, -2.4, 0, -2.9));
  // dog bed and ball
  const bed = place(torus(0.8, 0.28, C.peach), 3.4, 0.28, 2.0);
  bed.rotation.x = Math.PI / 2;
  world.add(bed);
  world.add(place(cyl(0.8, 0.8, 0.1, '#fbe3cf'), 3.4, 0.12, 2.0));
  world.add(place(sphere(0.25, C.yellow), -1.2, 0.33, 2.8));
  world.add(plant(5, -3.5, 1.4));
  // lamp
  world.add(place(cyl(0.06, 0.06, 2.6, C.charcoal), -5, 1.3, 1.8));
  world.add(place(cyl(0.35, 0.55, 0.6, C.cream), -5, 2.8, 1.8));
}

function kitchen() {
  base(12, 9, '#fff1e2');
  wallsBack(12, 9, 4.5, C.mint);
  world.add(place(rbox(7, 1.9, 1.5, 0.15, C.white), -1.5, 0.95, -3.5));
  world.add(place(rbox(7.2, 0.15, 1.7, 0.06, C.lavenderDeep), -1.5, 1.95, -3.5));
  world.add(place(rbox(1.9, 3.8, 1.6, 0.25, '#f4f4f8'), 4.6, 1.9, -3.4));
  world.add(place(rbox(0.1, 1.2, 0.12, 0.04, C.charcoal), 3.7, 2.3, -2.55));
  // food bowl with kibble
  const bowl = new THREE.Group();
  bowl.add(place(cyl(0.62, 0.48, 0.34, C.pink), 0, 0.2, 0));
  for (let i = 0; i < 9; i++) bowl.add(place(sphere(0.12, C.tan), Math.cos(i * 0.7) * 0.32, 0.4, Math.sin(i * 0.7) * 0.32));
  world.add(place(bowl, 1.2, 0, 1.2));
  world.add(plant(-5, 3, 1.1));
}

function porch() {
  base(12, 10, C.grass, '#d9eccd');
  // house front
  world.add(place(rbox(12, 4.8, 0.5, 0.15, C.peach), 0, 2.4, -4.6));
  world.add(place(rbox(2, 3.2, 0.2, 0.1, C.pinkDeep), 0, 1.6, -4.3));
  world.add(place(sphere(0.12, C.gold, { metalness: 0.5, roughness: 0.3 }), 0.65, 1.6, -4.15));
  // doorbell camera
  world.add(place(rbox(0.35, 0.7, 0.15, 0.08, C.charcoal), 1.5, 1.9, -4.28));
  world.add(place(sphere(0.09, C.sky, { flat: true }), 1.5, 2.0, -4.2));
  // porch deck, step, mat, path
  world.add(place(rbox(6, 0.35, 3, 0.1, C.wood), 0, 0.2, -2.6));
  world.add(place(rbox(4, 0.2, 0.9, 0.08, '#d4ab80'), 0, 0.1, -0.7));
  world.add(place(rbox(1.8, 0.05, 1.1, 0.03, C.yellow), 0, 0.4, -2.6));
  world.add(place(rbox(2.6, 0.06, 5.5, 0.03, '#f3ece2'), 0, 0.06, 2.4));
  for (const [x, z, col] of [[-3, 1, C.pink], [-4, 2.5, C.yellow], [3.4, 1.4, C.pink], [4.2, 3, C.white], [-3.6, 3.8, C.white]]) {
    const f = new THREE.Group();
    f.add(place(capsule(0.04, 0.3, C.green), 0, 0.2, 0));
    for (let i = 0; i < 5; i++) f.add(place(sphere(0.11, col), Math.cos(i * 1.26) * 0.13, 0.48, Math.sin(i * 1.26) * 0.13));
    f.add(place(sphere(0.08, C.gold), 0, 0.5, 0));
    world.add(place(f, x, 0, z));
  }
  world.add(plant(-5, -3, 1.2));
}

function backyard() {
  base(13, 10, C.grass, '#d9eccd');
  for (let i = 0; i < 12; i++) world.add(place(rbox(0.7, 1.6, 0.2, 0.1, C.white), -5.5 + i, 0.8, -4.7));
  world.add(place(rbox(12.5, 0.2, 0.15, 0.06, C.white), 0, 1.3, -4.6));
  // doghouse
  const dh = new THREE.Group();
  dh.add(place(rbox(2.2, 1.6, 2, 0.15, C.pink), 0, 0.8, 0));
  const roofL = rbox(1.5, 0.15, 2.3, 0.06, C.yellow);
  roofL.position.set(-0.5, 1.95, 0);
  roofL.rotation.z = 0.7;
  const roofR = rbox(1.5, 0.15, 2.3, 0.06, C.yellow);
  roofR.position.set(0.5, 1.95, 0);
  roofR.rotation.z = -0.7;
  dh.add(roofL, roofR);
  dh.add(place(rbox(0.9, 1.0, 0.1, 0.4, C.charcoal), 0, 0.6, 1.0));
  world.add(place(dh, -4, 0, -2.5));
  // tree
  world.add(place(cyl(0.2, 0.28, 2.2, C.brown), 4.6, 1.1, -3));
  for (const [x, y, z, r] of [[4.6, 2.9, -3, 1], [4, 2.5, -2.6, 0.7], [5.2, 2.5, -3.2, 0.7]]) world.add(place(sphere(r, C.green), x, y, z));
  world.add(place(sphere(0.25, C.yellow), 3, 0.3, 2.5));
}

// ------------------------------------------------------------------ overlay

const hudCam = document.getElementById('cam');
const hudTime = document.getElementById('time');

// ------------------------------------------------------------------ scenes

const ROOMS = { living: livingRoom, kitchen, porch, backyard };
let currentRoom = '';
const cast = {};

function useRoom(name) {
  if (currentRoom === name) return;
  reset();
  ROOMS[name]();
  currentRoom = name;
  cast.biscuit = makeBiscuit();
  cast.dana = makePerson(LOOKS.dana);
  cast.maya = makePerson(LOOKS.maya);
  cast.sam = makePerson(LOOKS.sam);
  for (const k of Object.keys(cast)) world.add(cast[k]);
}

function show(names) {
  for (const k of Object.keys(cast)) cast[k].visible = names.includes(k);
}

/** Moves a figure to (x, z) facing along its direction of travel (yaw in radians). */
function at(o, x, z, yaw = 0, y = 0) {
  o.position.x = x;
  o.position.z = z;
  o.position.y += y;
  o.rotation.y = yaw;
}

const ease = (k) => (k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k));

const SCENES = {
  sheet(t) {
    useRoom('living');
    show(['biscuit', 'dana', 'maya']);
    frame(0, 1.2, 0, 13);
    poseBiscuit(cast.biscuit, 'sit', t);
    at(cast.biscuit, 0.8, 1.6, 0.4);
    posePerson(cast.maya, 'stand', t);
    at(cast.maya, -2.2, 1.2, 0.6);
    posePerson(cast.dana, 'stand', t);
    at(cast.dana, 3.4, 0.6, -0.2);
    return ['', ''];
  },
  hero(t) {
    useRoom('living');
    show(['biscuit', 'dana', 'maya']);
    frame(0.6, 1.8, 0.6, 9.4);
    poseBiscuit(cast.biscuit, 'sit', t);
    at(cast.biscuit, 0.8, 1.6, 0.4);
    posePerson(cast.maya, 'stand', t);
    at(cast.maya, -1.2, 1.4, 0.5);
    posePerson(cast.dana, 'stand', t);
    at(cast.dana, 2.6, 0.2, -0.3);
    return ['', ''];
  },
  portrait(t) {
    useRoom('living');
    show(['biscuit']);
    frame(0.8, 0.8, 1.6, 5);
    poseBiscuit(cast.biscuit, 'sit', t);
    at(cast.biscuit, 0.8, 1.6, 0.4);
    return ['', ''];
  },
  wake(t) {
    useRoom('living');
    show(['biscuit']);
    frame(0.5, 1, 0.5, 12);
    poseBiscuit(cast.biscuit, t < 2.4 ? 'lie' : 'stretch', t);
    at(cast.biscuit, 3.2, 2.0, 0.9);
    return ['Living Room', '7:12 AM'];
  },
  couch(t) {
    useRoom('living');
    show(['biscuit']);
    frame(-1.5, 1.2, -1.5, 10);
    poseBiscuit(cast.biscuit, 'lie', t);
    at(cast.biscuit, -2.4, -2.8, 0.2, 1.05);
    return ['Living Room', '11:20 AM'];
  },
  nap(t) {
    useRoom('living');
    show(['biscuit']);
    frame(2.5, 0.6, 1.5, 8);
    poseBiscuit(cast.biscuit, 'sleep', t);
    at(cast.biscuit, 3.4, 2.0, 0.5, 0.12);
    return ['Living Room', '1:05 PM'];
  },
  'window-watch'(t) {
    useRoom('living');
    show(['biscuit']);
    frame(2, 1.4, -2, 10);
    poseBiscuit(cast.biscuit, 'sit', t);
    at(cast.biscuit, 2.5, -2.9, Math.PI / 2 + 0.2);
    return ['Living Room', '3:32 PM'];
  },
  meal(t) {
    useRoom('kitchen');
    show(['biscuit', 'sam']);
    frame(0.5, 1.2, 0.5, 11);
    poseBiscuit(cast.biscuit, 'eat', t);
    at(cast.biscuit, 0.2, 1.3, 0);
    posePerson(cast.sam, 'stand', t);
    at(cast.sam, 3, -1, -2.4);
    return ['Kitchen', '7:31 AM'];
  },
  'walker-arrive'(t) {
    useRoom('porch');
    show(['dana']);
    frame(0, 1.4, 0, 12);
    const k = ease(t / 3.2);
    posePerson(cast.dana, k < 1 ? 'walk' : 'stand', t);
    at(cast.dana, 0, 4.6 - k * 6.2, -Math.PI / 2);
    return ['Front Door', '8:04 AM'];
  },
  'walk-start'(t) {
    useRoom('porch');
    show(['dana', 'biscuit']);
    frame(0, 1.4, 0, 12);
    const k = ease(t / 5);
    posePerson(cast.dana, 'walk', t);
    at(cast.dana, -0.6, -1.4 + k * 6.5, Math.PI / 2);
    poseBiscuit(cast.biscuit, 'walk', t);
    at(cast.biscuit, 0.7, -0.8 + k * 6.5, Math.PI / 2);
    return ['Front Door', '8:06 AM'];
  },
  'walk-end'(t) {
    useRoom('porch');
    show(['dana', 'biscuit']);
    frame(0, 1.4, 0, 12);
    const k = ease(t / 4.5);
    posePerson(cast.dana, k < 1 ? 'walk' : 'stand', t);
    at(cast.dana, -0.6, 5 - k * 6.4, -Math.PI / 2);
    poseBiscuit(cast.biscuit, k < 1 ? 'run' : 'sit', t);
    at(cast.biscuit, 0.8, 5.4 - k * 6.4, k < 1 ? -Math.PI / 2 : 0.4);
    return ['Front Door', '8:41 AM'];
  },
  'walker-leave'(t) {
    useRoom('porch');
    show(['dana']);
    frame(0, 1.4, 0, 12);
    const k = ease(t / 3.4);
    posePerson(cast.dana, 'walk', t);
    at(cast.dana, 0, -1.4 + k * 6.4, Math.PI / 2);
    return ['Front Door', '8:43 AM'];
  },
  zoomies(t) {
    useRoom('backyard');
    show(['biscuit']);
    frame(0, 1, 0, 13);
    const a = t * 1.5;
    poseBiscuit(cast.biscuit, 'run', t);
    at(cast.biscuit, Math.cos(a) * 3.4, 0.8 + Math.sin(a) * 2.6, -a - Math.PI / 2);
    return ['Backyard', '4:10 PM'];
  },
  'family-home'(t) {
    useRoom('porch');
    show(['maya', 'biscuit']);
    frame(0, 1.4, 0, 12);
    const k = ease(t / 2.8);
    posePerson(cast.maya, k < 1 ? 'walk' : 'reach', t);
    at(cast.maya, -0.7, 4.6 - k * 5.4, -Math.PI / 2);
    const j = ease(t / 1.6);
    poseBiscuit(cast.biscuit, t > 2.2 ? 'jump' : 'run', t);
    at(cast.biscuit, 1, -2.4 + j * 2.6, t > 2.2 ? Math.PI - 0.3 : Math.PI / 2);
    return ['Front Door', '6:24 PM'];
  },
  escape(t) {
    useRoom('porch');
    show(['biscuit']);
    frame(0, 1.2, 0, 12);
    const k = ease(t / 4);
    poseBiscuit(cast.biscuit, k < 1 ? 'walk' : 'sit', t);
    at(cast.biscuit, 0.4, -2.4 + k * 4.6, k < 1 ? Math.PI / 2 : 0.5);
    return ['Front Door', '2:20 PM'];
  },
};

window.SCENES = Object.keys(SCENES);
window.draw = (name, t) => {
  const [camera, time] = SCENES[name](t);
  hudCam.textContent = camera;
  hudTime.textContent = time;
  document.getElementById('hud').style.display = camera ? 'flex' : 'none';
  renderer.render(scene, cam);
  return true;
};
window.ready = true;
