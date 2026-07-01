import fs from "fs";
const binary = fs.readFileSync("../seed/lumenc.wasm");
const { instance } = await WebAssembly.instantiate(binary, {
  lumen: { console_print: (p, l) => {} },
});
const I = instance.exports;
const src = fs.readFileSync("emit_fn.lm", "utf8");
const b = Buffer.from(src, 'utf8');
new Uint8Array(I.mem.buffer, 20000, b.length).set(b);
I.compile(b.length);
const nerr = I.dbg_nerr();
console.log(nerr + " errors");
const m32 = new Int32Array(I.mem.buffer);
for (let i=0; i<Math.min(10, nerr); i++) {
  const dbase = 126000 + i*12;
  const tok = m32[dbase/4];
  const code = m32[dbase/4+1];
  const tkind = m32[(30000 + tok*12)/4];
  const ta = m32[(30000 + tok*12)/4+1];
  const tb = m32[(30000 + tok*12)/4+2];
  const tstr = Buffer.from(I.mem.buffer, 20000+ta, tb).toString();
  console.log("Error at token " + tok + " ('" + tstr + "') code " + code);
}
