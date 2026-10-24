// npm run stop: stops whatever is listening on the Pawzoo port (default 8787), on Windows, macOS or Linux.
import { execSync } from 'node:child_process';

const port = Number(process.env.PORT ?? process.argv[2] ?? 8787);
const run = (cmd) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return '';
  }
};

let pids = [];
if (process.platform === 'win32') {
  pids = run('netstat -ano -p tcp')
    .split(/\r?\n/)
    .filter((l) => /LISTENING/i.test(l) && new RegExp(`:${port}\\s`).test(l))
    .map((l) => l.trim().split(/\s+/).pop());
} else {
  pids = run(`lsof -ti tcp:${port} -sTCP:LISTEN`).split(/\s+/);
}
pids = [...new Set(pids.filter((p) => p && /^\d+$/.test(p) && Number(p) !== process.pid))];

if (!pids.length) {
  console.log(`Nothing is running on port ${port}.`);
} else {
  for (const pid of pids) {
    if (process.platform === 'win32') run(`taskkill /PID ${pid} /F`);
    else run(`kill ${pid}`);
    console.log(`Stopped process ${pid} on port ${port}.`);
  }
}
