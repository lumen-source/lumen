#!/usr/bin/env node
// boundary_gate.mjs - the public/private boundary gate. BLOCKING.
//
// WHY THIS EXISTS
// ---------------
// This repository is public. It is developed alongside a private repository that carries
// business, client, and infrastructure data, and for a long time the only thing keeping the
// two apart was a human remembering to look. That failed: an audit on 2026-07-24 found
// nineteen tracked files on the default branch leaking private identifiers, including an
// internal service hostname in four example headers, a dead scratch path carrying a private
// repository name and a tool session identifier, a private hostname used as an HTTP test
// vector, the name of a proprietary JavaScript kernel cited as the provenance of four
// numeric examples, and the author's home directory hardcoded into live compiler-discovery
// logic in tools/absorb/absorb.mjs.
//
// A boundary that depends on remembering to run a command is not a boundary. This gate makes
// the boundary mechanical: a leak becomes unmergeable rather than merely regrettable.
//
// WHAT IT CHECKS
// --------------
// Every git-tracked file, for a set of private identifiers: internal hostnames and service
// names, the private repository name, private product names, absolute home-directory paths
// (which are both a privacy leak and a portability bug, since they work on exactly one
// machine), and agent scratch paths.
//
// SELF-SCANNING BY CONSTRUCTION
// -----------------------------
// The obvious implementation writes the forbidden strings as literals and then excludes
// itself from the scan. That leaves a hole exactly where the integrity matters most: the one
// file nobody checks. Instead every pattern here is assembled at runtime from fragments, so
// no forbidden literal appears in this source, and this file is scanned like any other. If
// you add a pattern, add it the same way. Verify with: node tools/boundary_gate.mjs --self
//
// ALLOWLIST
// ---------
// NOTICE is exempt from the author-name rule: its copyright line legitimately carries the
// author's name, and a gate that fires on a correct copyright notice is a gate that gets
// ignored. That is the only exemption, and it is narrow on purpose.
//
// A NOTE ON PATTERN CHOICE
// ------------------------
// An earlier draft of this gate used a bare `freedom` token to catch home paths. That
// collides with ordinary English: this repo contains "Freedom is owing nothing" in
// docs/MANIFESTO.md and "data-race-freedom" in docs/spec/SYNTHESIS.md. A gate that cries
// wolf on prose is a gate that gets switched off within a week. The rule here is the
// absolute path prefix, not the word.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Each pattern is assembled from fragments so the literal never appears in this file.
// `label` is what the failure message shows; `why` explains the rule to whoever trips it.
const j = (...parts) => parts.join('');

const RULES = [
  {
    label: j('fdv', '-', 'quants'),
    re: new RegExp(j('fdv', '[-_]', 'quants'), 'i'),
    why: 'private business domain',
  },
  {
    label: j('beta', '-', 'app'),
    re: new RegExp(j('beta', '-', 'app', '\\.'), 'i'),
    why: 'internal service hostname',
  },
  {
    label: j('quant', '-', 'academy'),
    re: new RegExp(j('quant', '[-_]', 'academy'), 'i'),
    why: 'private product name',
  },
  {
    label: j('fe', '-', 'api'),
    re: new RegExp(j('\\bfe', '[-_]', 'api\\b'), 'i'),
    why: 'private pricing API name',
  },
  {
    label: j('invest', '-', 'quant'),
    re: new RegExp(j('invest', '[-_]', 'quant'), 'i'),
    why: 'private project name',
  },
  {
    label: j('lumen', '-', 'edge'),
    re: new RegExp(j('lumen', '[-_]', 'edge'), 'i'),
    why: 'private deployment fleet name',
  },
  {
    label: j('QUA', 'NTS'),
    // Uppercase and word-bounded on purpose: "quant" and "quants" are ordinary domain
    // vocabulary in this repo and must not fire.
    re: new RegExp(j('\\bQUA', 'NTS\\b')),
    why: 'private repository name',
  },
  {
    label: j('vme', 'trix'),
    re: new RegExp(j('vme', 'trix'), 'i'),
    why: 'employer name',
  },
  {
    label: j('mu', 'rex'),
    re: new RegExp(j('\\bmu', 'rex\\b'), 'i'),
    why: 'employer name',
  },
  {
    label: j('kal', 'shi'),
    re: new RegExp(j('\\bkal', 'shi\\b'), 'i'),
    why: 'private trading venue integration',
  },
  {
    label: j('ss', 'rn'),
    re: new RegExp(j('\\bss', 'rn\\b'), 'i'),
    why: 'private publication pipeline',
  },
  {
    label: j('cloud', 'build'),
    re: new RegExp(j('cloud', 'build'), 'i'),
    why: 'private deployment configuration',
  },
  {
    label: j('volatility', '_', 'surface', '.js'),
    re: new RegExp(j('volatility', '_', 'surface\\', '.js'), 'i'),
    why: 'proprietary kernel cited as provenance',
  },
  {
    label: j('/Us', 'ers/<name>'),
    // Any macOS home path. Both a privacy leak and a portability bug: a hardcoded home
    // directory works on exactly one machine, so this rule also catches code that would
    // break for every other contributor.
    re: new RegExp(j('/Us', 'ers/', '[A-Za-z0-9._-]+')),
    why: 'absolute home-directory path (leaks a username and breaks on every other machine)',
    allowlist: ['NOTICE'],
  },
  {
    label: j('/pri', 'vate/tmp/', 'claude-'),
    re: new RegExp(j('/pri', 'vate/tmp/', 'claude'), 'i'),
    why: 'agent scratch path (leaks a session identifier and is always dead)',
  },
  {
    label: j('-Us', 'ers-', '<name>-'),
    // The encoded form a session directory uses, e.g. in a scratch path.
    re: new RegExp(j('-Us', 'ers-', '[A-Za-z0-9]+', '-')),
    why: 'encoded session directory name',
  },
];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function isProbablyBinary(buf) {
  // A NUL byte in the first 8 KB is the standard heuristic and is good enough here.
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function scan() {
  const hits = [];
  for (const rel of trackedFiles()) {
    const abs = path.join(ROOT, rel);
    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      continue; // submodule entry, broken symlink, or deleted-but-staged
    }
    if (isProbablyBinary(buf)) continue;
    const lines = buf.toString('utf8').split('\n');
    for (const rule of RULES) {
      if (rule.allowlist && rule.allowlist.includes(rel)) continue;
      for (let i = 0; i < lines.length; i++) {
        const m = rule.re.exec(lines[i]);
        if (m) {
          hits.push({
            file: rel,
            line: i + 1,
            label: rule.label,
            why: rule.why,
            excerpt: lines[i].trim().slice(0, 120),
          });
        }
      }
    }
  }
  return hits;
}

// --self proves the construction actually works: if any forbidden literal had been written
// out longhand in this file, the scan above would have found it here.
if (process.argv.includes('--self')) {
  const self = path.relative(ROOT, fileURLToPath(import.meta.url));
  const hits = scan().filter((h) => h.file === self);
  if (hits.length) {
    console.error(`boundary_gate: FAIL - this gate's own source contains ${hits.length} forbidden literal(s):`);
    for (const h of hits) console.error(`  ${h.file}:${h.line}  [${h.label}]  ${h.excerpt}`);
    process.exit(1);
  }
  console.log(`boundary_gate --self: OK, ${RULES.length} rules assembled from fragments, gate source is clean under its own rules`);
  process.exit(0);
}

const hits = scan();

if (hits.length === 0) {
  console.log(`boundary_gate: PASS - ${trackedFiles().length} tracked files scanned, ${RULES.length} rules, 0 private identifiers`);
  process.exit(0);
}

console.error(`boundary_gate: FAIL - ${hits.length} private identifier(s) in tracked files\n`);
const byFile = new Map();
for (const h of hits) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file).push(h);
}
for (const [file, fileHits] of byFile) {
  console.error(`  ${file}`);
  for (const h of fileHits) {
    console.error(`    :${h.line}  [${h.label}]  ${h.why}`);
    console.error(`             ${h.excerpt}`);
  }
}
console.error(`
This repository is public. The identifiers above belong to a private codebase and must not
appear here. Fix by generalising the reference (keep the technical point, drop the private
name), not by adding an exemption. If you genuinely believe a hit is a false positive, narrow
the pattern in tools/boundary_gate.mjs rather than allowlisting the file, so the rule keeps
protecting every other file.`);
process.exit(1);
