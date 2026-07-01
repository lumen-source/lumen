import { compileToIR } from '../native/pipeline.mjs';

function generateLumenProgram(linesTarget) {
  let src = `fn helper(x: Float) -> Float {
  var y = x\n`;
  const repeats = Math.max(1, linesTarget - 6);
  for (let i = 0; i < repeats; i++) {
    src += `  y = y + 1.0\n`;
  }
  src += `  return y
}
fn main(c: Console) -> Unit {
  let x = helper(1.5)
}\n`;
  return src;
}

function generateLumenProgramWithError(linesTarget) {
  let src = generateLumenProgram(linesTarget);
  // Introduce a syntax or type error near the end
  src = src.replace(`let x = helper(1.5)`, `let x = helper(1.5 + "invalid_type_error")`);
  return src;
}

async function runCompilerBench() {
  const sizes = [100, 500, 1200];
  console.log("=================== COMPILER SPEED REPORT ===================");
  console.log("Size (LOC) | Cold (ms) | Incremental (ms) | Throughput (kLOC/s) | Edit-to-Error (ms)");
  console.log("--------------------------------------------------------------------------");

  for (const size of sizes) {
    const src = generateLumenProgram(size);
    const srcErr = generateLumenProgramWithError(size);

    // 1. Cold compile (first run)
    const t0 = process.hrtime.bigint();
    await compileToIR(src);
    const t1 = process.hrtime.bigint();
    const coldMs = Number(t1 - t0) / 1e6;

    // 2. Incremental/Warm compiles (run 5 times and take average)
    const warmRuns = 5;
    let totalWarmMs = 0;
    for (let r = 0; r < warmRuns; r++) {
      const w0 = process.hrtime.bigint();
      await compileToIR(src);
      const w1 = process.hrtime.bigint();
      totalWarmMs += Number(w1 - w0) / 1e6;
    }
    const incMs = totalWarmMs / warmRuns;

    // 3. Throughput based on warm compile
    const throughputKloc = (size / 1000) / (incMs / 1000); // kLOC per second

    // 4. Edit-to-Error latency
    const te0 = process.hrtime.bigint();
    try {
      await compileToIR(srcErr);
    } catch (e) {
      // Expected compile error
    }
    const te1 = process.hrtime.bigint();
    const errMs = Number(te1 - te0) / 1e6;

    console.log(
      `${size.toString().padEnd(10)} | ` +
      `${coldMs.toFixed(1).padStart(9)} | ` +
      `${incMs.toFixed(1).padStart(16)} | ` +
      `${throughputKloc.toFixed(1).padStart(19)} | ` +
      `${errMs.toFixed(1).padStart(18)}`
    );
  }
  console.log("=============================================================");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  runCompilerBench();
}
export { runCompilerBench };
