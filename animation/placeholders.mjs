// Stand-in clips and snapshots for every replayed moment, so the whole pipeline runs before the
// animation is rendered. Each is clearly labelled as a placeholder. Run: node animation/placeholders.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const media = join(root, 'media');
mkdirSync(join(media, 'clips'), { recursive: true });
mkdirSync(join(media, 'snapshots'), { recursive: true });

const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const moments = [
  ['wake', 'Living Room', '7:12 AM', 'Biscuit wakes up and stretches', '#d9c3a5'],
  ['meal', 'Kitchen', '7:31 AM', 'Breakfast, gone in a minute', '#e5cfa8'],
  ['walker-arrive', 'Front Door', '8:04 AM', 'Dana rings the bell', '#b9c7c9'],
  ['walk-start', 'Front Door', '8:06 AM', 'Off on the morning walk', '#b9c7c9'],
  ['walk-end', 'Front Door', '8:41 AM', 'Back from the walk', '#b9c7c9'],
  ['walker-leave', 'Front Door', '8:43 AM', 'Dana heads out', '#b9c7c9'],
  ['couch', 'Living Room', '11:20 AM', 'Claims the couch. Again.', '#d9c3a5'],
  ['nap', 'Living Room', '1:05 PM', 'A long afternoon nap', '#e8d6b0'],
  ['window-watch', 'Living Room', '3:32 PM', 'On patrol at the window', '#d9c3a5'],
  ['zoomies', 'Backyard', '4:10 PM', 'Backyard zoomies', '#b8cfa3'],
  ['family-home', 'Front Door', '6:24 PM', 'Maya is home', '#c9b9c9'],
  ['escape', 'Front Door', '2:20 PM', 'Outside the front door alone', '#e3b7a0'],
  ['biscuit', 'Pawzoo', '', 'Biscuit', '#e8743b'],
];

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019").replace(/%/g, '\\%');

for (const [name, camera, time, caption, color] of moments) {
  const filters = [
    `drawbox=x=0:y=0:w=iw:h=70:color=black@0.45:t=fill`,
    `drawtext=fontfile=${FONT}:text='${esc(camera)}':x=28:y=22:fontsize=28:fontcolor=white`,
    time ? `drawtext=fontfile=${FONT}:text='${esc(time)}':x=w-tw-28:y=22:fontsize=28:fontcolor=white` : null,
    `drawtext=fontfile=${FONT}:text='${esc(caption)}':x=(w-tw)/2:y=(h-th)/2-20:fontsize=54:fontcolor=0x2b211a`,
    `drawtext=fontfile=${FONT}:text='Placeholder until the animation is rendered':x=(w-tw)/2:y=(h/2)+50:fontsize=24:fontcolor=0x2b211a@0.7`,
  ]
    .filter(Boolean)
    .join(',');
  const base = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=1280x720:r=24`];
  execFileSync('ffmpeg', [...base, '-frames:v', '1', '-vf', filters, join(media, 'snapshots', `${name}.jpg`)]);
  if (name !== 'biscuit') {
    execFileSync('ffmpeg', [...base, '-t', '5', '-vf', filters, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(media, 'clips', `${name}.mp4`)]);
  }
  console.log('placeholder', name);
}
