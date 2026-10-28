const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const prismaCli = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
const appEntry = path.join(root, 'dist', 'main.js');

function migrate() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const forward = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canRetry(output) {
  return /P1001|ECONNREFUSED|Can't reach database server|Can’t reach database server|Server has closed the connection|timed out|ECONNRESET/i.test(output);
}

async function applyMigrations() {
  let last = { code: 1, output: '' };
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    last = await migrate();
    if (last.code === 0) return;
    if (!canRetry(last.output)) {
      console.error('Migration failed. If this Docker MySQL volume already has tables from an older copy of the project, reset it with: docker compose down -v');
      process.exit(last.code);
    }
    console.log(`MySQL is not ready (${attempt}/30). Retrying...`);
    await sleep(2000);
  }
  process.exit(last.code);
}

applyMigrations()
  .then(() => {
    const app = spawn(process.execPath, [appEntry], {
      env: process.env,
      stdio: 'inherit',
    });
    app.on('exit', (code) => process.exit(code ?? 1));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
