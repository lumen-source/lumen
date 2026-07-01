import os from 'node:os';
import { execFileSync } from 'node:child_process';

// Get CPU and System hardware info
export function getSystemInfo() {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
  const cpuCores = cpus.length;
  const platform = os.platform();
  const arch = os.arch();
  const totalMemGb = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
  return {
    cpuModel,
    cpuCores,
    platform,
    arch,
    totalMemGb
  };
}

// Timing harness that runs a JS function multiple times and takes the median
export async function runTimedJob({
  name,
  jobFn,
  warmupRuns = 3,
  benchmarkRuns = 5,
  size = 1
}) {
  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    jobFn();
  }

  // Benchmark
  const durationsSec = [];
  for (let i = 0; i < benchmarkRuns; i++) {
    const start = process.hrtime.bigint();
    jobFn();
    const end = process.hrtime.bigint();
    const elapsedNs = Number(end - start);
    durationsSec.push(elapsedNs / 1e9);
  }

  // Median
  durationsSec.sort((a, b) => a - b);
  const medianSec = durationsSec[Math.floor(benchmarkRuns / 2)];
  const opsPerSec = size / medianSec;

  return {
    name,
    medianSec,
    opsPerSec
  };
}

// Timing harness that runs an external binary multiple times and parses elapsed time
export function runTimedBinary({
  name,
  binaryPath,
  args = [],
  benchmarkRuns = 5,
  size = 1,
  parseTimeFromStdout = false // if true, parses time from stdout. Otherwise measures process runtime.
}) {
  const sysInfo = getSystemInfo();
  
  // Warmup run
  try {
    execFileSync(binaryPath, args, { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`Failed to run warmup for ${name}: ${e.message}`);
  }

  const runTimes = [];
  let lastStdout = '';

  for (let i = 0; i < benchmarkRuns; i++) {
    const start = process.hrtime.bigint();
    const stdout = execFileSync(binaryPath, args, { encoding: 'utf8' });
    const end = process.hrtime.bigint();
    lastStdout = stdout;

    if (parseTimeFromStdout) {
      // Expect C binary to print its own time, e.g. "ELAPSED: 0.0123"
      const match = stdout.match(/ELAPSED:\s*([\d.]+)/i);
      if (match) {
        runTimes.push(parseFloat(match[1]));
      } else {
        throw new Error(`Expected time pattern not found in output for ${name}`);
      }
    } else {
      const elapsedSec = Number(end - start) / 1e9;
      runTimes.push(elapsedSec);
    }
  }

  runTimes.sort((a, b) => a - b);
  const medianSec = runTimes[Math.floor(benchmarkRuns / 2)];
  const opsPerSec = size / medianSec;

  return {
    name,
    medianSec,
    opsPerSec,
    stdout: lastStdout,
    sysInfo
  };
}
