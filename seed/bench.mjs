// Benchmark the Lumen-mu compiler + bytecode interpreter on fib(30).
import fs from 'node:fs'; import wabtInit from 'wabt';
const SRC = `fn fib(n: Int) -> Int {
  if n < 2 { return n }
  return fib(n - 1) + fib(n - 2)
}
fn main(console: Console) -> Unit { console.print_int(fib(30)) }`;
const wabt = await wabtInit();
let t = performance.now();
const binary = wabt.parseWat('lumenc.wat', fs.readFileSync(new URL('./lumenc.wat', import.meta.url),'utf8')).toBinary({}).buffer;
const tAsm = performance.now()-t;
let out='';
const { instance } = await WebAssembly.instantiate(binary, { lumen:{ console_print:(p,l)=>{ out+=Buffer.from(new Uint8Array(instance.exports.mem.buffer,p,l)).toString('utf8'); }}});
const b = Buffer.from(SRC,'utf8');
new Uint8Array(instance.exports.mem.buffer,100000,b.length).set(b);
t=performance.now(); const ir=instance.exports.compile(b.length); const tCompile=performance.now()-t;
t=performance.now(); instance.exports.run(instance.exports.dbg_main()); const tRun=performance.now()-t;
const fib=n=>{let a=0,bb=1;for(let i=0;i<n;i++){[a,bb]=[bb,a+bb];}return a;};
const calls=2*fib(31)-1;
console.log(`result: ${out.trim()}  (expected 832040)`);
console.log(`wat assemble (one-time dev tool): ${tAsm.toFixed(1)} ms`);
console.log(`compile source->IR: ${tCompile.toFixed(3)} ms  (${ir} IR words)`);
console.log(`run (interpret fib(30)): ${tRun.toFixed(1)} ms`);
console.log(`~${calls.toLocaleString()} function calls  ->  ~${(calls/(tRun/1000)/1e6).toFixed(1)} M calls/sec (bytecode interpreter; native backend is future work)`);
