// standalone_diff.mjs - M3 standalone exe differential test harness & purity gates
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createCompiler } from '../seed/compiler_core.mjs';

const SCALAR = [
  'fib_print', 'add', 'max', 'fact', 'locals', 'forward', 'mutual', 'compare', 'gcd', 'count', 'sum_loop'
];
const PROGRAMS = [
  ...SCALAR,
  'hello', 'greet', 'report', 'fizzbuzz', 'safe_div', 'propagate'
];

async function main() {
  const lumen = await createCompiler();
  let pass = 0, fail = 0;

  console.log("== Standalone execution conformance & purity gates ==");

  for (const name of PROGRAMS) {
    const srcPath = new URL(`../mu/examples/${name}.lm`, import.meta.url);
    const src = fs.readFileSync(srcPath, 'utf8');
    const ref = lumen.run(src);
    if (!ref.ok) {
      console.log(`SKIP  ${name} (interpreter compile error)`);
      continue;
    }

    const exePath = `/tmp/lumen_standalone_${name}`;
    
    // Clean up old binary if exists
    try { fs.unlinkSync(exePath); } catch (_) {}

        // 1. Build
    try {
      execFileSync('node', ['build.mjs', fileURLToPath(srcPath), '-o', exePath], { stdio: 'ignore' });
    } catch (e) {
      console.log(`FAIL  ${name} (build failed: ${e.message})`);
      fail++;
      continue;
    }

    // 2. Run standalone EXE directly
    let stdout = '';
    let exitCode = 0;
    try {
      stdout = execFileSync(exePath, { encoding: 'utf8' });
    } catch (e) {
      stdout = e.stdout ? e.stdout.toString() : '';
      exitCode = typeof e.status === 'number' ? e.status : 1;
    }

    // 3. Assertions
    const expectedExit = ref.crash ? 1 : 0;
    const stdoutMatch = stdout === ref.stdout;
    const exitMatch = exitCode === expectedExit;

    if (!stdoutMatch || !exitMatch) {
      console.log(`FAIL  ${name.padEnd(10)} stdoutMatch=${stdoutMatch} (exe=${JSON.stringify(stdout)}, ref=${JSON.stringify(ref.stdout)}), exitMatch=${exitMatch} (exe=${exitCode}, ref=${expectedExit})`);
      fail++;
      continue;
    }

    // 4. Purity gate
    try {
      const output = execFileSync('otool', ['-L', exePath], { encoding: 'utf8' });
      const lines = output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length !== 2) {
        throw new Error(`Expected exactly 2 lines in otool -L output, got ${lines.length}`);
      }
      const libLine = lines[1];
      if (!libLine.startsWith('/usr/lib/libSystem.B.dylib')) {
        throw new Error(`Library is not libSystem.B.dylib. Got: ${libLine}`);
      }
    } catch (e) {
      console.log(`FAIL  ${name} (purity gate failed: ${e.message})`);
      fail++;
      continue;
    }

    console.log(`PASS  ${name.padEnd(10)} (standalone matches interpreter + libSystem purity gate)`);
    pass++;

    // Cleanup temp binary
    try { fs.unlinkSync(exePath); } catch (_) {}
  }

  // 5. Offline cleanliness check
  try {
    const buildSrc = fs.readFileSync(new URL('./build.mjs', import.meta.url), 'utf8');
    const forbidden = ['http', 'https', 'fetch', 'net'];
    const importLines = buildSrc.split('\n').filter(line => line.trim().startsWith('import '));
    for (const line of importLines) {
      for (const mod of forbidden) {
        if (line.includes(`'${mod}'`) || line.includes(`"${mod}"`) || line.includes(`'node:${mod}'`) || line.includes(`"node:${mod}"`)) {
          throw new Error(`build.mjs imports forbidden network module "${mod}"`);
        }
      }
    }
    console.log("PASS  offline-cleanliness: build.mjs imports touch no network module");
  } catch (e) {
    console.log(`FAIL  offline-cleanliness: ${e.message}`);
    fail++;
  }

  console.log(`\n${pass}/${PROGRAMS.length} standalone executables built and run successfully.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
