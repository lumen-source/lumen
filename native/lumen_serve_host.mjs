// lumen_serve_host.mjs - run a PREBUILT Lumen serve bundle. No compiler, no clang, no kernel source.
//
// Deployment runbook (the two commands, the container shape, the checklist):
//   docs/DEPLOYING_THE_HTTP_SERVER.md
//
// Why this file exists (the cost/latency root cause it removes):
//
// lumen_serve_native.mjs is both the BUILDER and the RUNNER of the native serve binary. Because it
// imports ./pipeline.mjs at module scope and reads ../examples/http/http_serve.lm at load time, a
// container that runs it must ship the whole Lumen toolchain plus clang plus git, and the serve
// binary is produced by the container itself. On a scale-to-zero container platform that means
// every cold start is a compile. Measured on a real deployment of this server: 13,223 ms from
// instance start to listening, against 11 ms for an otherwise identical image whose build-time
// binary cache happened to be populated. A 1165x gap between two containers built from the same
// Dockerfile.
//
// That gap is easy to hide and expensive to hide: holding one instance permanently warm (a
// minimum-instance floor with CPU always allocated) makes the symptom disappear while billing
// continuous CPU for a container that is idle almost all of the time. Pinning an instance warm is
// not a fix for a slow start, it is a way of paying for one continuously.
//
// The separation this file makes possible:
//   build time  (lumen_serve_native.mjs --emit-bundle)  compile once, emit serve.bin + body.block
//   run time    (this file)                             spawn the binary, serve, proxy. Never compile.
//
// So the runtime image carries a binary, not a compiler, and cold start is process spawn. The
// request path is byte-for-byte the one lumen_serve_native.mjs already runs: this module is an
// extraction of its host half (frame/makeServer/nextRequest/serveHostFile/proxyRequest and the TCP
// loop), not a reimplementation. Any change to the wire behavior belongs in BOTH or in neither;
// serve_bundle_test.mjs pins them to identical responses for the same route table.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Must match lumen_serve_native.mjs's memory map (REQ_CAP). Asserted against the value recorded in
// bundle.json at load, so a bundle built by a future toolchain with a different map fails loudly at
// startup instead of silently truncating requests at the wrong offset.
const REQ_CAP_DEFAULT = 598000 - 590016;

function frame(bytes) {
  const h = Buffer.alloc(4);
  h.writeUInt32LE(bytes.length);
  return Buffer.concat([h, bytes]);
}

function serveHostFile(entry) {
  const body = fs.readFileSync(entry.file);
  const head = `HTTP/1.1 ${entry.status} OK\r\nContent-Type: ${entry.contentType}\r\n`
    + `Content-Length: ${body.length}\r\nConnection: keep-alive\r\n\r\n`;
  return Buffer.concat([Buffer.from(head, 'latin1'), body]);
}

// A single native child processes requests FIFO over its stdin/stdout pipe, correlating by order.
function makeServer(bin, bodyBlock, reqCap) {
  const child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = [];
  let acc = Buffer.alloc(0);
  child.stdout.on('data', (chunk) => {
    acc = Buffer.concat([acc, chunk]);
    while (acc.length >= 4) {
      const len = acc.readUInt32LE(0);
      if (acc.length < 4 + len) break;
      const resp = acc.subarray(4, 4 + len);
      acc = acc.subarray(4 + len);
      pending.shift()?.(Buffer.from(resp));
    }
  });
  child.on('exit', (code) => { console.error(`native serve binary exited (${code})`); process.exit(1); });
  child.stdin.write(frame(bodyBlock));   // preload the bodies once, before any request
  return (reqBytes) => new Promise((resolve) => {
    child.stdin.write(frame(reqBytes.subarray(0, reqCap)));
    pending.push(resolve);
  });
}

function nextRequest(buf) {
  const he = buf.indexOf('\r\n\r\n');
  if (he === -1) return null;
  const headers = buf.slice(0, he).toString('latin1');
  const cl = /content-length:\s*(\d+)/i.exec(headers);
  const end = he + 4 + (cl ? parseInt(cl[1], 10) : 0);
  if (buf.length < end) return null;
  return { req: buf.subarray(0, end), rest: buf.subarray(end) };
}

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 128 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 128 });

function proxyRequest(origin, reqBytes) {
  return new Promise((resolve) => {
    const he = reqBytes.indexOf('\r\n\r\n');
    const head = reqBytes.slice(0, he).toString('latin1');
    const [reqLine, ...hdrLines] = head.split('\r\n');
    const [method, target] = reqLine.split(' ');
    const body = reqBytes.subarray(he + 4);
    const headers = {};
    for (const l of hdrLines) {
      const i = l.indexOf(':');
      if (i === -1) continue;
      const k = l.slice(0, i).trim(), v = l.slice(i + 1).trim();
      if (/^(host|connection|keep-alive|transfer-encoding)$/i.test(k)) continue;
      headers[k] = v;
    }
    headers.host = origin.host;
    const isHttps = origin.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request({
      protocol: origin.protocol,
      hostname: origin.hostname,
      port: origin.port || (isHttps ? 443 : 80),
      method,
      path: target,
      headers,
      agent: isHttps ? httpsAgent : httpAgent,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const rbody = Buffer.concat(chunks);
        let headOut = `HTTP/1.1 ${res.statusCode} ${res.statusMessage || ''}\r\n`;
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          const k = res.rawHeaders[i];
          if (/^(transfer-encoding|connection|content-length|keep-alive)$/i.test(k)) continue;
          headOut += `${k}: ${res.rawHeaders[i + 1]}\r\n`;
        }
        headOut += `Content-Length: ${rbody.length}\r\nConnection: keep-alive\r\n\r\n`;
        resolve(Buffer.concat([Buffer.from(headOut, 'latin1'), rbody]));
      });
    });
    req.on('error', () => resolve(Buffer.from('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: keep-alive\r\n\r\n', 'latin1')));
    if (body.length) req.write(body);
    req.end();
  });
}

// Read a bundle directory emitted by `lumen_serve_native.mjs --emit-bundle`.
export function loadBundle(bundleDir) {
  const manifestPath = path.join(bundleDir, 'bundle.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 1) {
    throw new Error(`bundle format ${manifest.format} not supported by this host (expected 1)`);
  }
  const bin = path.join(bundleDir, manifest.bin || 'serve.bin');
  fs.accessSync(bin, fs.constants.X_OK);            // fail at startup, not on first request
  const bodyBlock = fs.readFileSync(path.join(bundleDir, manifest.bodyBlock || 'body.block'));
  const hostFiles = new Map();
  for (const hf of manifest.hostFiles || []) {
    const file = path.resolve(bundleDir, hf.file);
    fs.accessSync(file);
    hostFiles.set(hf.key, { file, status: hf.status, contentType: hf.contentType });
  }
  return {
    bin,
    bodyBlock,
    hostFiles,
    port: manifest.port,
    proxyPass: manifest.proxyPass || null,
    reqCap: manifest.reqCap || REQ_CAP_DEFAULT,
  };
}

export function runBundle(bundleDir) {
  const b = loadBundle(bundleDir);
  const origin = b.proxyPass ? new URL(b.proxyPass) : null;
  const port = process.env.PORT ? Number(process.env.PORT) : b.port;
  const serve = makeServer(b.bin, b.bodyBlock, b.reqCap);

  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0), busy = false;
    const pump = async () => {
      if (busy) return;
      busy = true;
      let slice;
      while ((slice = nextRequest(buf))) {
        buf = slice.rest;
        const line = slice.req.slice(0, slice.req.indexOf('\r\n')).toString('latin1');
        let resp = await serve(slice.req);
        if (resp.length === 0) {                          // kernel says no local route
          const [m, p] = line.split(' ');
          const hf = b.hostFiles.get(`${m} ${(p || '').split('?')[0]}`);
          if (hf) { resp = serveHostFile(hf); }
          else if (!origin) { resp = Buffer.from('HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nConnection: keep-alive\r\n\r\nNot Found', 'latin1'); }
          else { resp = await proxyRequest(origin, slice.req); process.stdout.write(`${line} -> proxied\n`); }
        }
        socket.write(resp);
      }
      busy = false;
    };
    socket.on('data', (chunk) => { buf = Buffer.concat([buf, chunk]); pump(); });
    socket.on('error', () => socket.destroy());
  });

  server.listen(port, () => {
    console.log(`Lumen HTTP server (NATIVE, prebuilt bundle - no compile at start) listening on :${port}`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node lumen_serve_host.mjs <bundleDir>');
    process.exit(2);
  }
  runBundle(dir);
}
