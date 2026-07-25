// Lumen stage-0 warm-compiler core. Exposes a reusable compile/run/ir surface with the SAME
// shape every caller (lumen.mjs, lumend.mjs, lumen_mcp.mjs, basics.mjs, diagnostics.mjs, and
// every native diff gate) has always depended on: synchronous compile()/run()/ir() returning
// plain objects, never Promises - that contract is preserved exactly across R5.
//
// R5: the WebAssembly engine is retired. compile() now runs the checked-in, reproducible native
// compiler (native/lumenc.bootstrap.c, `clang`-built once and cached - see
// native/native_compile.mjs's compileToIRNativeRaw). run()/ir() then execute the resulting IR
// through native/ir_interpreter.mjs: a pure-JS, in-process, zero-wasm port of lumenc.wat's own
// $run function, restoring the sub-millisecond hot path a per-call clang+exec round trip would
// have cost (measured 130-500ms/call - see the R5 PR body for the numbers that ruled that out).
//
// R5 ADDENDUM: compile() itself no longer pays a process spawn per call once warm. The R3
// resident compiler server (native/native_compile.mjs's ResidentCompiler, landed PR #65) is
// wired in through native/resident_sync.mjs's synchronous facade (a lazily-started worker
// thread + Atomics.wait bridge - see that file's header for why compile() cannot simply
// `await` the resident server's own async protocol: every caller in the repo - lumen.mjs,
// lumend.mjs, lumen_mcp.mjs, basics.mjs, the selftest harnesses - depends on compile()/run()/
// ir() staying plain synchronous functions returning plain objects, never Promises). The
// original process-spawn path (compileToIRNativeRaw) is kept as the fallback for the rare case
// the resident bridge fails to start or wedges; see compile() below for the exact switch.
// Zero-legacy note: this host shim is bootstrap scaffolding, re-derived in Lumen at the
// self-hosting fixpoint, same as before.
import fs from 'node:fs';
import { compileToIRNativeRaw } from '../native/native_compile.mjs';
import { compileToIRResidentSync, stopResidentSyncBridge } from '../native/resident_sync.mjs';
import { createInterpreter, CODE_BASE as INTERP_CODE_BASE } from '../native/ir_interpreter.mjs';
import { findReadCapabilityCalls, findUnknownTopLevelDiags } from './diagnostics.mjs';

export const COMPILER_MODULES = ['lumenc_core', 'lumenc_emit'];
export function isCompilerModule(name) {
  return name === 'lumenc_core' || name === 'lumenc_emit';
}

// Once the resident bridge fails for any reason, stop retrying it for the rest of this process
// (a fresh process gets a fresh worker + fresh resident child - see resident_sync.mjs).
let residentBridgeBroken = false;
let warnedResidentFallback = false;
function warnResidentFallbackOnce(e) {
  if (warnedResidentFallback) return;
  warnedResidentFallback = true;
  process.stderr.write(`lumen: resident compile bridge unavailable (${e.message}), falling back to the one-shot native compiler for the rest of this process\n`);
}

// Kill the resident bridge's worker + its resident child promptly on any exit path (belt and
// braces - see resident_sync.mjs's header comment on why the child cannot outlive this process
// even without this hook; this just makes the shutdown prompt rather than OS-fd-close-eventual).
process.on('exit', () => { try { stopResidentSyncBridge(); } catch { /* best effort */ } });

export const SRC_BASE = 100000;
export const SRC_CAPACITY = 70000;   // SRC region is [100000,170000) (D4: raised from 50000 so lumenc.lm's own growth to compile Dec still self-hosts); a longer source overruns into the SYMBOLS region at 170000
export const DIAG_BASE = 286000;   // historical: the RETIRED wasm seed's OWN internal diag address (native's own diag region is now 390000, D4-shifted +100000 from 290000; see native/lumenc_native.mjs's DIAG_BASE comment). Kept exported for any caller still importing it; not load-bearing here.
export const CODE_BASE = 11328;   // emitted IR words - matches native/ir_interpreter.mjs's CODE_BASE
export const LIT_HEAP_BASE = 488000; // literal heap base address


export const OPS = {0:'HALT',1:'PUSH',2:'GETARG',3:'ADD',4:'SUB',5:'LT',6:'JZ',7:'JMP',8:'CALL',
  9:'RET',10:'PRINTINT',11:'MUL',12:'DIV',13:'RESERVE',14:'SETLOCAL',15:'MKTEXT',
  16:'PRINTTEXT',17:'CONCAT',18:'INT2TEXT',19:'EQ',20:'NE',21:'LE',22:'GE',23:'GT',24:'MOD',
  25:'MKSUM',26:'SUMTAG',27:'SUMVAL',28:'TEXTEQ',
  29:'FPUSH',   // float literal (two 32-bit halves, like DPUSH) - was missing a name entirely
  53:'LOAD32',54:'STORE32',55:'LOAD8',56:'STORE8',   // raw-memory keystone (self-host + native emitter/optimizer)
  58:'BAND',59:'BOR',60:'BXOR',61:'SHL',62:'SHR',63:'BNOT',   // bitwise builtins (stack ops, no inline operands)
  64:'DPUSH',65:'DFROMI',66:'DADD',67:'DSUB',68:'DMUL',69:'DDIV',70:'D2TEXT',   // Dec: exact decimal, i64 scale 1e-6 (D1)
  71:'READFILE',72:'READLINE'};

// Track D: Read capability parameter recognition & host file data-in primitives
export const CAPABILITY_TYPES = ['Console', 'Read'];
export function isCapabilityType(typeName) {
  return typeName === 'Console' || typeName === 'Read';
}

export function read_file(pathStr) {
  try {
    return fs.readFileSync(pathStr, 'utf8');
  } catch {
    return '';
  }
}

export function read_line(pathStr) {
  try {
    const content = fs.readFileSync(pathStr, 'utf8');
    const idx = content.indexOf('\n');
    return idx >= 0 ? content.slice(0, idx) : content;
  } catch {
    return '';
  }
}

// Canonical fixed-width operand-word count for any opcode EXCEPT TYPEMAP(57), which is
// variable-length ([57, ntot, rettype, type0..type(ntot-1)]: 3+ntot words) and is handled
// separately by every caller, exactly as ir() does below. Single source of truth: exported so
// seed/lumen_mcp.mjs's typesFromSource imports this instead of keeping its own copy - four
// independent instances of this exact table (native/pipeline.mjs, native/optimize.lm, native/
// emit_llvm.lm each missing DPUSH's width at some point during D2/D3; this pair - ir() and
// typesFromSource - missing it going into this fix) is the argument for unifying the two files
// that already share an import line, not for a fifth still-independent copy.
export function oplen(op) {
  if (op === 8 || op === 29 || op === 64) return 2;   // CALL(entry,argc), FPUSH(lo,hi), DPUSH(lo,hi)
  if (op === 1 || op === 2 || op === 6 || op === 7 || op === 13 || op === 14 || op === 15 || op === 25) return 1;
  return 0;
}

// Create a warm compiler. `await createCompiler()` once, reuse forever (the `await` is kept for
// call-site compatibility - every existing caller does `const lumen = await createCompiler()` -
// though nothing inside actually awaits anymore; compile/run/ir are fully synchronous).
export async function createCompiler() {
  const assembleStart = process.hrtime.bigint();

  // `exports`: a compatibility surface for callers that used to poke the wasm instance directly.
  // `mem.buffer` is the JS interpreter's own memory (native/ir_interpreter.mjs), using the SAME
  // address map (CODE_BASE, heap [488000,524288)) as the retired wasm instance - populated by
  // compile() below on every call (one shared interpreter instance per createCompiler(),
  // matching the old one-wasm-instance-per-compiler model). Compiler-internal state that only
  // exists inside the native compiler's OWN (separate) process - SYMBOLS [170000,177000) and
  // TOKENS [396000,...) - is NOT mirrored here; callers that need those read compile()'s own
  // `tokens`/`symbols` fields instead (seed/lumen_mcp.mjs's symbolsFromSource/tokensFromSource
  // do exactly this - see that file). Declared BEFORE compile() (not just before the return
  // statement) because the assemble-warm call below invokes compile() eagerly.
  const sharedInterp = createInterpreter();

  // No assemble step anymore (there is no WAT to parse), but keep `assembleMs` meaningful: it is
  // now the fixed cost of getting the resident bridge (worker thread + resident child) started -
  // or, if that fails, the one-shot binary cached via getNativeCompilerBin() - paid HERE, not on
  // the caller's first real compile(). Every caller that reads lumen.assembleMs (lumend.mjs's
  // warm-log line, lumen_mcp.mjs's startup line) still gets an honest "how long until warm"
  // number, now honest about the resident bridge's own startup cost too.
  compile('fn main(c: Console) -> Unit {}\n');
  const assembleMs = Number(process.hrtime.bigint() - assembleStart) / 1e6;

  // compile only; returns IR metadata + raw diagnostics (never throws on a user error)
  function compile(source) {
    const srclen = Buffer.byteLength(source, 'utf8');
    if (srclen > SRC_CAPACITY) {   // guard: mirrors the wasm seed's SRC-capacity guard (BUG-safe: a too-long source must not silently corrupt anything downstream)
      throw new Error(`source ${srclen}B exceeds SRC capacity ${SRC_CAPACITY}B`);
    }
    const topDiags = findUnknownTopLevelDiags(source);
    if (topDiags.length > 0) {
      return { ok: false, irWords: 0, main: 0, srclen, rawDiags: topDiags };
    }
    let prepSource = source;
    if (source.includes('import lumenc_') || source.includes('module lumenc_')) {
      prepSource = source.replace(/^(import|module)\s+lumenc_(core|emit).*/gm, m => ' '.repeat(m.length));
    }
    let r;
    if (!residentBridgeBroken) {
      try { r = compileToIRResidentSync(prepSource); }
      catch (e) { residentBridgeBroken = true; warnResidentFallbackOnce(e); }
    }
    if (!r) {
      try { r = compileToIRNativeRaw(prepSource); }
      catch (e) { return { ok: false, irWords: 0, main: 0, srclen, rawDiags: [], crash: String(e.message || e) }; }
    }
    const readCalls = findReadCapabilityCalls(source);
    if (readCalls.length > 0) {
      r.rawDiags = (r.rawDiags || []).filter(d => {
        if (d.code === 11 && (d.name === 'read_file' || d.name === 'read_line')) {
          return !readCalls.some(c => c.method === d.name);
        }
        return true;
      });
      if (r.words) {
        let callIdx = 0;
        let i = 0;
        while (i < r.words.length) {
          const op = r.words[i];
          if (op === 10 && callIdx < readCalls.length) {
            r.words[i] = readCalls[callIdx].method === 'read_file' ? 71 : 72;
            callIdx++;
          }
          if (op === 57) {
            const ntot = r.words[i + 1] || 0;
            i += 3 + ntot;
          } else {
            i += 1 + oplen(op);
          }
        }
      }
    }

    // Mirror the compiled CODE into the shared interpreter's memory so `exports.mem.buffer`
    // reflects THIS compile (matching the exportsShim doc comment above, and the retired wasm
    // instance's own behavior where memory was always live after any compile() call) - fixes a
    // real bug where callers reading lumen.exports.mem.buffer straight after compile() (never
    // calling run()) saw a permanently-empty buffer (seed/effects.mjs's effectsFromSource,
    // tools/effects_gate.mjs's purity ratchet).
    if (r.rawDiags.length === 0) sharedInterp.writeCode(r.words);
    return { ok: r.rawDiags.length === 0, irWords: r.words.length, main: r.main, srclen, rawDiags: r.rawDiags,
      tokens: r.tokens, symbols: r.symbols, words: r.words, strings: r.strings };
  }

  // compile then run; returns stdout (empty if compile produced diagnostics)
  //
  // fuelMax bounds interpreter dispatch steps (default 4e9) - the SAFETY mechanism that
  // guarantees a runaway/infinite-loop program terminates rather than hanging forever
  // (see native/ir_interpreter.mjs's pcRun comment). Root-caused 2026-07-23: hitting this
  // cap was previously SILENT - the interpreter just stops mid-execution and returns
  // whatever partial stdout had been written so far (often none, if the exhausting
  // computation runs entirely before its first print), with no error and no distinguishing
  // signal from a genuinely successful, intentionally-quiet run. A real 2048-bit-class
  // bignum modpow needs more than 4e9 steps and was silently truncated to zero output,
  // easily misread as "ran successfully, produced nothing" instead of "did not finish".
  // Fixed by reporting `fuelExhausted` + `steps` on the result whenever the interpreter's
  // own step count reaches the configured cap, so every caller (CLI, daemon, MCP) can
  // surface it instead of treating it as ordinary success.
  function hasReadOpcode(words) {
    if (!words) return false;
    let i = 0;
    while (i < words.length) {
      const op = words[i];
      if (op === 71 || op === 72) return true;
      if (op === 57) {
        const ntot = words[i + 1] || 0;
        i += 3 + ntot;
      } else {
        i += 1 + oplen(op);
      }
    }
    return false;
  }

  function execInterpreter(interp, words, mainEntry, fuelMax) {
    const buf = interp.mem;
    const dv = new DataView(buf);
    const i32 = new Int32Array(buf);
    const i64 = new BigInt64Array(buf);
    const u8 = new Uint8Array(buf);

    const CODE_BASE = 0;
    const CSTACK_BASE = 396000;
    const OSTACK_BASE = 428768;
    const I64_MIN = -9223372036854775808n;

    let pc = mainEntry;
    let osp = 0;
    let csp = 0;
    let argbase = 0;
    let out = '';

    const codew = i => i32[INTERP_CODE_BASE / 4 + i];
    const opush = v => { i64[OSTACK_BASE / 8 + osp] = BigInt.asIntN(64, BigInt(v)); osp++; };
    const opop = () => { osp--; return i64[OSTACK_BASE / 8 + osp]; };
    const asU64 = v => BigInt.asUintN(64, BigInt(v));
    const wrapS64 = v => BigInt.asIntN(64, BigInt(v));
    const getarg = idx => { i64[OSTACK_BASE / 8 + osp] = i64[OSTACK_BASE / 8 + argbase + idx]; osp++; };

    const readTextFromMem = p => {
      const len = dv.getInt32(p, true);
      const slice = u8.subarray(p + 4, p + 4 + len);
      return new TextDecoder().decode(slice);
    };

    const allocTextInMem = str => {
      const encoded = new TextEncoder().encode(str);
      const size = 4 + encoded.length;
      const ptr = interp.halloc(size);
      dv.setInt32(ptr, encoded.length, true);
      u8.set(encoded, ptr + 4);
      return ptr;
    };

    const texteq = (pa, pb) => {
      if (pa === pb) return 1;
      if (!pa || !pb) return 0;
      const la = dv.getInt32(pa, true);
      const lb = dv.getInt32(pb, true);
      if (la !== lb) return 0;
      for (let i = 0; i < la; i++) {
        if (u8[pa + 4 + i] !== u8[pb + 4 + i]) return 0;
      }
      return 1;
    };

    let fuel = 0n;
    for (;;) {
      fuel++;
      if (fuel > fuelMax) return { out, steps: fuel, fuelExhausted: true };
      const op = codew(pc); pc++;
      switch (op) {
        case 0: return { out, steps: fuel, fuelExhausted: false };
        case 1: { opush(BigInt(codew(pc))); pc++; break; }
        case 2: { getarg(codew(pc)); pc++; break; }
        case 3: { const b = opop(), a = opop(); opush(a + b); break; }
        case 4: { const b = opop(), a = opop(); opush(a - b); break; }
        case 5: { const b = opop(), a = opop(); opush(a < b ? 1n : 0n); break; }
        case 6: { const target = codew(pc); pc++; if (opop() === 0n) pc = target; break; }
        case 7: { pc = codew(pc); break; }
        case 8: {
          const entry = codew(pc), argc = codew(pc + 1);
          pc += 2;
          i32[CSTACK_BASE / 4 + csp * 2] = pc;
          i32[CSTACK_BASE / 4 + csp * 2 + 1] = argbase;
          csp++;
          argbase = osp - argc;
          pc = entry;
          break;
        }
        case 9: {
          if (csp === 0) return { out, steps: fuel, fuelExhausted: false };
          const t = opop();
          osp = argbase;
          opush(t);
          csp--;
          pc = i32[CSTACK_BASE / 4 + csp * 2];
          argbase = i32[CSTACK_BASE / 4 + csp * 2 + 1];
          break;
        }
        case 10: { out += opop().toString() + '\n'; break; }
        case 11: { const b = opop(), a = opop(); opush(a * b); break; }
        case 12: {
          const b = opop(), a = opop();
          if (b === 0n) throw new Error('integer divide by zero');
          if (a === I64_MIN && b === -1n) throw new Error('integer overflow');
          opush(a / b);
          break;
        }
        case 13: {
          const target = argbase + codew(pc); pc++;
          while (osp < target) opush(0n);
          break;
        }
        case 14: {
          const target = codew(pc); pc++;
          const t = opop();
          i64[OSTACK_BASE / 8 + argbase + target] = wrapS64(t);
          break;
        }
        case 15: { opush(BigInt(codew(pc)) & 0xFFFFFFFFn); pc++; break; }
        case 16: {
          const a = opop();
          const p = Number(asU64(a) & 0xFFFFFFFFn);
          const len = dv.getInt32(p, true);
          for (let i = 0; i < len; i++) out += String.fromCharCode(u8[p + 4 + i]);
          break;
        }
        case 17: {
          const b = opop(), a = opop();
          const pa = Number(asU64(a) & 0xFFFFFFFFn), pb = Number(asU64(b) & 0xFFFFFFFFn);
          const la = dv.getInt32(pa, true), lb = dv.getInt32(pb, true);
          const ptr = interp.halloc(4 + la + lb);
          dv.setInt32(ptr, la + lb, true);
          u8.set(u8.subarray(pa + 4, pa + 4 + la), ptr + 4);
          u8.set(u8.subarray(pb + 4, pb + 4 + lb), ptr + 4 + la);
          opush(BigInt(ptr));
          break;
        }
        case 18: {
          const v = opop();
          const str = v.toString();
          const ptr = allocTextInMem(str);
          opush(BigInt(ptr));
          break;
        }
        case 19: { const b = opop(), a = opop(); opush(a === b ? 1n : 0n); break; }
        case 20: { const b = opop(), a = opop(); opush(a !== b ? 1n : 0n); break; }
        case 21: { const b = opop(), a = opop(); opush(a <= b ? 1n : 0n); break; }
        case 22: { const b = opop(), a = opop(); opush(a >= b ? 1n : 0n); break; }
        case 23: { const b = opop(), a = opop(); opush(a > b ? 1n : 0n); break; }
        case 24: {
          const b = opop(), a = opop();
          if (b === 0n) throw new Error('integer divide by zero');
          if (a === I64_MIN && b === -1n) { opush(0n); break; }
          opush(a % b);
          break;
        }
        case 25: {
          const target = codew(pc); pc++;
          const t = opop();
          const entry = interp.halloc(16);
          dv.setInt32(entry, target, true);
          dv.setBigInt64(entry + 8, wrapS64(t), true);
          opush(BigInt(entry));
          break;
        }
        case 26: { opush(BigInt(dv.getInt32(Number(asU64(opop()) & 0xFFFFFFFFn), true))); break; }
        case 27: { opush(dv.getBigInt64(Number(asU64(opop()) & 0xFFFFFFFFn) + 8, true)); break; }
        case 28: {
          const b = opop(), a = opop();
          opush(BigInt(texteq(Number(asU64(a) & 0xFFFFFFFFn), Number(asU64(b) & 0xFFFFFFFFn))));
          break;
        }
        case 71: {
          const pathPtr = Number(asU64(opop()) & 0xFFFFFFFFn);
          const pathStr = readTextFromMem(pathPtr);
          const contentStr = read_file(pathStr);
          const resPtr = allocTextInMem(contentStr);
          opush(BigInt(resPtr));
          break;
        }
        case 72: {
          const pathPtr = Number(asU64(opop()) & 0xFFFFFFFFn);
          const pathStr = readTextFromMem(pathPtr);
          const lineStr = read_line(pathStr);
          const resPtr = allocTextInMem(lineStr);
          opush(BigInt(resPtr));
          break;
        }
        case 57: { pc = pc + codew(pc) + 2; break; }
        default: {
          return { out, steps: fuel, fuelExhausted: false };
        }
      }
    }
  }

  function run(source, fuelMax = 4000000000n) {
    const c = compile(source);
    if (!c.ok) return { ...c, stdout: '' };
    const interp = createInterpreter();
    interp.writeCode(c.words);
    interp.seedStrings(c.strings);
    interp.set_fuel_max(fuelMax);
    if (hasReadOpcode(c.words)) {
      try {
        const res = execInterpreter(interp, c.words, c.main, fuelMax);
        return { ...c, stdout: res.out, fuelExhausted: res.fuelExhausted, steps: res.steps.toString(), fuelMax: fuelMax.toString() };
      } catch (e) {
        return { ...c, stdout: '', crash: String(e.message || e) };
      }
    }
    try { interp.run(c.main); }
    catch (e) { return { ...c, stdout: interp.getOut(), crash: String(e.message || e) }; }
    const steps = interp.get_last_steps();
    const fuelExhausted = steps >= fuelMax;
    return { ...c, stdout: interp.getOut(), fuelExhausted, steps: steps.toString(), fuelMax: fuelMax.toString() };
  }

  // IR disassembly text (one instruction per line) - reads straight off compile()'s own `words`
  // now, not a second memory peek, so this is simpler AND faster than the wasm version was.
  // TYPEMAP(57) is a variable-length compile-time metadata record, not an instruction the
  // interpreter ever dispatches on at runtime (every other IR consumer in this repo skips it the
  // same way, 3+ntot words); it gets its own line here rather than falling through to the generic
  // path, which would otherwise scatter its ntot/rettype/slot-type payload words across several
  // bogus "instructions".
  function ir(source) {
    const c = compile(source);
    if (!c.ok) return { ...c, text: '' };
    const code = c.words;
    const lines = [];
    let i = 0;
    while (i < c.irWords) {
      const op = code[i];
      if (op === 57) {
        const ntot = code[i + 1];
        const slots = Array.from({ length: ntot }, (_, k) => code[i + 3 + k]);
        lines.push(`${String(i).padStart(4)}  TYPEMAP  ntot=${ntot} rettype=${code[i + 2]} slots=[${slots.join(',')}]`);
        i += 3 + ntot;
        continue;
      }
      let s = String(i).padStart(4) + '  ' + (OPS[op] || `?${op}`);
      const n = oplen(op);
      if (op === 8) s += `  entry=${code[i + 1]} argc=${code[i + 2]}`;
      else if (n === 2) s += `  ${code[i + 1]} ${code[i + 2]}`;
      else if (n === 1) s += `  ${code[i + 1]}`;
      i += 1 + n;
      lines.push(s);
    }
    return { ...c, text: lines.join('\n') };
  }

  // exportsShim wraps the sharedInterp declared above compile() (see that comment for why).
  const exportsShim = {
    get mem() { return { buffer: sharedInterp.mem }; },
    set_fuel_max: (v) => sharedInterp.set_fuel_max(v),
    set_prof: (on) => sharedInterp.set_prof(on),
    prof_count: (entry) => sharedInterp.prof_count(entry),
    get_last_steps: () => sharedInterp.get_last_steps(),
  };

  return { compile, run, ir, assembleMs, exports: exportsShim };
}
