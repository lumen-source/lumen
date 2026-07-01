import fs from "fs";
import { freshInstance, writeSrc } from "./pipeline.mjs";
async function run() {
  const I = await freshInstance();
  const len = writeSrc(I, fs.readFileSync("emit_fn.lm", "utf8"));
  I.ex.compile(len);
  const nerr = I.ex.dbg_nerr();
  console.log(nerr + " errors");
  const m32 = new Int32Array(I.ex.mem.buffer);
  const SRC_BASE = 100000;
  for (let i=0; i<Math.min(10, nerr); i++) {
    const dbase = 286000 + i*12;
    const code = m32[dbase/4];
    const off = m32[dbase/4+1];
    const elen = m32[dbase/4+2];
    const tstr = Buffer.from(I.ex.mem.buffer, off, elen).toString();
    console.log("Error code " + code + " at '" + tstr + "' (byte " + (off - SRC_BASE) + ")");
  }
}
run();
