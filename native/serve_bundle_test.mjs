// serve_bundle_test.mjs - the prebuilt serve bundle: same bytes on the wire, and provably no
// compile at start.
//
// This test exists because of a real, measured deployment failure, not a hypothetical one. An HTTP
// edge built on this server shipped the compiler in its runtime image and built the serve binary at
// container start. On a scale-to-zero container platform every cold start therefore paid a full
// emit_fn.lm -> C -> clang -O2 compile: 13,223 ms from instance start to listening, versus 11 ms
// for an otherwise identical image whose build-time binary cache was populated. The gap was masked
// for weeks by holding an instance permanently warm with CPU always allocated, which converts a
// latency bug into a continuous CPU bill for a container that is idle almost all of the time.
//
// The lesson the earlier fix missed: caching the compile output makes the compile UNLIKELY, it
// does not make it IMPOSSIBLE, and nothing failed when it silently came back (most of the deployed
// images predated the cache and were still compiling on every start, undetected, because every
// existing health check looked at URLs and none looked at startup). So test 3 below is the one
// that matters: it runs the host with clang absent from PATH entirely. A host that can still serve
// is a host that provably did not compile - a property, not an observation.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { emitBundle } from './lumen_serve_native.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-serve-bundle-'));
const cfgPath = path.join(tmp, 'routes.json');
fs.writeFileSync(cfgPath, JSON.stringify({
  port: 0,
  routes: [
    { method: 'GET', path: '/', status: 200, contentType: 'text/plain', body: 'hi' },
    { method: 'GET', path: '/health', status: 200, contentType: 'application/json', body: '{"status":"ok"}' },
  ],
}));

// --- 1. emitBundle produces a self-contained artifact -------------------------------------------
const outDir = path.join(tmp, 'bundle');
const manifest = await emitBundle(cfgPath, outDir);
ok(fs.existsSync(path.join(outDir, 'serve.bin')), 'bundle contains the native binary');
ok(fs.existsSync(path.join(outDir, 'body.block')), 'bundle contains the preload block');
ok(fs.existsSync(path.join(outDir, 'bundle.json')), 'bundle contains the manifest');
ok(manifest.format === 1, 'manifest declares a format version (host refuses anything else)');
ok((fs.statSync(path.join(outDir, 'serve.bin')).mode & 0o111) !== 0, 'binary is executable');

// --- 2/3. the host serves correct bytes, WITHOUT clang on PATH ----------------------------------
// PATH is stripped to a directory that provably holds no clang. If the host had retained any
// compile path, spawning it here would fail outright rather than serve.
const emptyBin = path.join(tmp, 'nobin');
fs.mkdirSync(emptyBin, { recursive: true });
ok(!fs.existsSync(path.join(emptyBin, 'clang')), 'test PATH directory contains no clang');

function get(port, target) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      sock.write(`GET ${target} HTTP/1.1\r\nHost: x\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    sock.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      const he = buf.indexOf('\r\n\r\n');
      if (he === -1) return;
      const cl = /content-length:\s*(\d+)/i.exec(buf.slice(0, he).toString('latin1'));
      if (buf.length >= he + 4 + (cl ? +cl[1] : 0)) { sock.destroy(); resolve(buf.toString('latin1')); }
    });
    sock.on('error', reject);
    setTimeout(() => { sock.destroy(); reject(new Error('timeout')); }, 15000);
  });
}

const PORT = 18099;
const host = spawn(process.execPath, [path.join(__dirname, 'lumen_serve_host.mjs'), outDir], {
  env: { ...process.env, PATH: emptyBin, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let hostOut = '';
host.stdout.on('data', (c) => { hostOut += c; });
host.stderr.on('data', (c) => { hostOut += c; });

const started = Date.now();
await new Promise((resolve, reject) => {
  const t = setInterval(() => {
    if (/listening on/.test(hostOut)) { clearInterval(t); resolve(); }
    if (Date.now() - started > 20000) { clearInterval(t); reject(new Error(`host never listened:\n${hostOut}`)); }
  }, 20);
});
const startMs = Date.now() - started;

try {
  const root = await get(PORT, '/');
  const health = await get(PORT, '/health');
  ok(root.endsWith('\r\n\r\nhi') && root.includes('Content-Type: text/plain'),
    'GET / served correctly with clang absent from PATH');
  ok(health.includes('{"status":"ok"}') && health.includes('application/json'),
    'GET /health served correctly with clang absent from PATH');
  ok(!/no local route|404/.test(root), 'kernel routes resolve from the preloaded body block');
  // A compile is seconds; a spawn is milliseconds. This is a coarse floor on purpose - it is the
  // assertion that would have caught the four stale production images, all of which took ~13 s.
  ok(startMs < 3000, `host reached listening in ${startMs} ms (a compile-at-start would be seconds)`);
} finally {
  host.kill();
}

// --- 4. the host cannot compile, structurally ---------------------------------------------------
// A source-level check, deliberately, in addition to the behavioral one above: the behavioral test
// proves this build does not compile, this proves no future edit can quietly reintroduce the
// import that made compiling possible.
const hostSrc = fs.readFileSync(path.join(__dirname, 'lumen_serve_host.mjs'), 'utf8');
const importLines = hostSrc.split('\n').filter((l) => /^import .* from /.test(l));
const foreign = importLines.filter((l) => !/from 'node:[a-z_]+';$/.test(l.trim()));
ok(foreign.length === 0,
  `host imports node builtins only (found ${foreign.length} other import(s): ${foreign.join(' | ')})`);
ok(!/pipeline\.mjs|lumenc|emit_fn|clang/.test(hostSrc.replace(/^\/\/.*$/gm, '')),
  'host code references no compiler, emitter, or clang outside comments');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail === 0 ? '\nserve bundle: all checks correct.' : `\nFAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
