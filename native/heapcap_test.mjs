import fs from 'node:fs';
import { createCompiler } from '../seed/compiler_core.mjs';
import { buildAndRunFn } from './pipeline.mjs';

const PROGRAM = `
type Box = | Boxed(Int)

fn main(c: Console) -> Unit {
  var s = "1234"
  var i = 0
  while true {
    s = text_concat(s, "12345678")
    let x = Boxed(0)
    c.print("iter ")
    c.print(int_to_text(i))
    c.print("\\n")
    i = i + 1
  }
}
`;

async function main() {
  const lumen = await createCompiler();
  
  console.log("Running interpreter...");
  const ref = lumen.run(PROGRAM);
  
  console.log("Running native compiler...");
  let cand;
  try {
    cand = await buildAndRunFn(PROGRAM);
  } catch (e) {
    console.error("FAIL: Native build/run failed:", e.message);
    process.exit(1);
  }
  
  const ok = cand.stdout === ref.stdout;
  console.log(`\nInterpreter iterations: ${ref.stdout.split('\n').length - 1}`);
  console.log(`Native iterations:      ${cand.stdout.split('\n').length - 1}`);
  
  if (ok) {
    console.log("PASS: Native and interpreter outputs match exactly.");
    process.exit(0);
  } else {
    console.log("FAIL: Outputs differ.");
    console.log("--- Interpreter tail ---");
    console.log(ref.stdout.substring(ref.stdout.length - 200));
    console.log("--- Native tail ---");
    console.log(cand.stdout.substring(cand.stdout.length - 200));
    process.exit(1);
  }
}

main().catch(console.error);
