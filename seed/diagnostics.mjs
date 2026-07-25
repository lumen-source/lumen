// The canonical Lumen Diagnostic, host-side for stage-0. The compiler emits minimal raw
// records (a code plus a source span); this layer renders them into the schema-versioned
// structure an agent consumes: a stable code, a severity, a span, a short message, typed
// args, and (where the compiler is confident) a machine-applicable fix. The English text
// is rendered here from the code registry, so the machine stream stays token-cheap.
// Schema is intentionally small; it grows with the Phase 2 checker.

export const SCHEMA_VERSION = 1;

// raw compiler code -> stable diagnostic id, message, and fix strategy.
// fix strategies: 'delete-span' (the parser recovered by skipping the token),
// 'insert-brace' (close an unterminated block), or null (no confident fix).
const REGISTRY = {
  1: { id: 'E0001', sev: 'error', msg: 'unknown variable', fix: null,
       explain: 'A name was used as a value but is not a parameter or a local binding in scope. Bind it with `let`, pass it as a parameter, or correct the spelling.' },
  2: { id: 'E0002', sev: 'error', msg: 'unknown function', fix: null,
       explain: 'A call targets a function that is not defined anywhere in the program. Define it (any order is fine, forward references resolve) or correct the spelling.' },
  3: { id: 'E0003', sev: 'error', msg: 'unexpected token', fix: 'delete-span',
       explain: 'A token appeared where no construct can begin. The compiler recovered by skipping it; the confident fix deletes it.' },
  4: { id: 'E0004', sev: 'error', msg: "expected '}'", fix: 'insert-brace',
       explain: 'A block was opened with `{` but the end of input arrived before its closing `}`. The confident fix inserts the missing brace.' },
  5: { id: 'E0005', sev: 'error', msg: 'decimal literal has too many fractional digits', fix: null,
       explain: 'A Dec literal (the `d` suffix, e.g. 1.50d) carries at most 6 fractional digits (Dec\'s fixed scale is 1e-6, one micro-unit). Round the literal to 6 or fewer digits after the point, or compute the extra precision at runtime with dec_div.' },
  6: { id: 'E0006', sev: 'error', msg: 'decimal literal is too large to represent', fix: null,
       explain: 'A Dec literal, scaled by 1,000,000, does not fit in a signed 64-bit integer (the valid magnitude is at most 9223372036854775807; the largest whole-number Dec literal is 9223372036854d). Use a smaller magnitude.' },
  7: { id: 'E0007', sev: 'error', msg: 'Float and Dec cannot mix', fix: null,
       explain: 'Dec (exact fixed-point) and Float (binary floating point) are never implicitly convertible: mixing them in one expression would silently reintroduce the rounding error Dec exists to avoid. Convert explicitly with dec_to_float(d) (Dec -> Float, lossy; there is no reverse float_to_dec), or keep both operands the same type.' },
  8: { id: 'E0008', sev: 'error', msg: 'cannot divide Dec directly; use dec_div(a, b)', fix: null,
       explain: 'The / operator is undefined for Dec (including an Int mixed with Dec) because a bare division can produce a result that needs more than 6 fractional digits, and truncating it silently would reintroduce non-exact results. Use dec_div(a, b), which performs the division with an explicit, documented rounding rule (round-half-to-even) and traps on division by zero or on overflow. Not machine-auto-applied by `lumen fix`: rewriting `a / b` into `dec_div(a, b)` needs each operand\'s own source span, and a bare Int operand (a routine, expected case for Dec) does not retain one in the token stream (see $lex\'s number branch) -- so the confident-fix schema intentionally is not extended for this one code. The message above is the fix.' },
  9: { id: 'E0009', sev: 'error', msg: 'Bool cannot mix with Int, Float, or Dec', fix: null,
       explain: 'Bool (true/false, and the result of a comparison) is a distinct type from Int, Float, and Dec: there is no implicit or explicit coercion between them. This code covers every way a Bool value ends up where a non-Bool was expected or vice versa: a Bool operand in +, -, *, /, or an ordering comparison (<, <=, >, >=); a non-Bool operand to `and`, `or`, or `not`; or a non-Bool `if`/`while` condition (e.g. `if x` where `x` is an Int is now a type error, not a truthiness test). Bool `==`/`!=` between two Bools is allowed. Convert an Int to a Bool with an explicit comparison (`x != 0`) rather than relying on truthiness.' },
  10: { id: 'E0010', sev: 'error', msg: 'unknown capability receiver; add a `console: Console` parameter and pass it in', fix: null,
       explain: 'The receiver of a capability method call (the `c` in `c.print(...)`) must be a binding that is in scope, exactly like any other variable reference. Until this code existed the parser captured the receiver span and then discarded it, so `anything_at_all.print_int(n)` compiled and printed even inside a function that declares no Console parameter. That made RULES.md Rule 5 ("a function with no capability parameters is provably pure") false in the implementation rather than merely unenforced. Fix by threading the capability in as a parameter: `fn helper(console: Console, n: Int)`, called as `helper(console, n)` from a function that already holds one. `main` is where a Console enters the program, and it declares it like any other parameter (`fn main(console: Console) -> Unit`), so every function that prints has one in its signature. Receiver type-checking is enforced for capability method calls.' },
  11: { id: 'E0011', sev: 'error', msg: 'unknown capability method; Console has exactly two: print(Text) and print_int(Int)', fix: null,
       explain: 'Console has exactly two operations: print(Text) and print_int(Int). Any other method name is rejected here. Until this code existed the dispatch fell through to an unconditional PRINTINT for every unrecognised name, so `c.print_float(1.5)` compiled clean and printed 4609434218613702656 (the raw f64 bit pattern) and `c.frobnicate(5)` printed 5. That is a wrong-answer bug, not just a missing diagnostic. There is no float printing in this subset: format the value yourself (see examples/black_scholes.lm\'s float_to_text) or scale to an Int and use print_int.' },
  12: { id: 'E0210', sev: 'error', msg: 'non-exhaustive pattern match', fix: null,
       explain: 'A `match` expression does not cover all possible constructors of the sum type. Add arms for all missing variants or include a fallback wildcard arm.' },
};
const UNKNOWN = { id: 'E0000', sev: 'error', msg: 'error', fix: null, explain: 'Unclassified compiler error.' };

function lineCol(source, off) {
  off = Math.max(0, Math.min(off, source.length));
  let line = 1, col = 1;
  for (let i = 0; i < off; i++) { if (source.charCodeAt(i) === 10) { line++; col = 1; } else col++; }
  return { line, col };
}

export function findCapabilityReceiverDiags(source, existingDiags = []) {
  if (!source) return [];
  const diags = [];
  const existingOffsets = new Set((existingDiags || []).filter(d => d.code === 10).map(d => d.byteOff));

  let masked = '';
  let inString = false;
  let inComment = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (inComment) {
      if (ch === '\n') { inComment = false; masked += '\n'; }
      else masked += ' ';
    } else if (inString) {
      if (ch === '\\') { masked += '  '; i++; }
      else if (ch === '"') { inString = false; masked += '"'; }
      else masked += ' ';
    } else {
      if (ch === '#' || (ch === '/' && next === '/')) { inComment = true; masked += ' '; }
      else if (ch === '"') { inString = true; masked += '"'; }
      else masked += ch;
    }
  }

  const fnRegex = /\bfn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;
  let match;
  while ((match = fnRegex.exec(masked)) !== null) {
    const paramsStr = match[2];
    const paramTypes = {};
    const paramRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let pMatch;
    while ((pMatch = paramRegex.exec(paramsStr)) !== null) {
      paramTypes[pMatch[1]] = pMatch[2];
    }

    const braceStart = masked.indexOf('{', fnRegex.lastIndex);
    if (braceStart === -1) continue;
    let depth = 1;
    let bodyEnd = braceStart + 1;
    while (bodyEnd < masked.length && depth > 0) {
      if (masked[bodyEnd] === '{') depth++;
      else if (masked[bodyEnd] === '}') depth--;
      bodyEnd++;
    }
    const body = masked.slice(braceStart + 1, bodyEnd - 1);
    const bodyOffset = braceStart + 1;

    const localTypes = {};
    const localRegex = /\b(?:let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*))?/g;
    let lMatch;
    while ((lMatch = localRegex.exec(body)) !== null) {
      if (lMatch[2]) {
        localTypes[lMatch[1]] = lMatch[2];
      }
    }

    const methodRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    let mMatch;
    while ((mMatch = methodRegex.exec(body)) !== null) {
      const receiverName = mMatch[1];
      const methodName = mMatch[2];
      const recOffset = bodyOffset + mMatch.index;

      let reqCapType = null;
      if (methodName === 'print' || methodName === 'print_int') {
        reqCapType = 'Console';
      } else if (methodName === 'read_file' || methodName === 'read_line') {
        reqCapType = 'Read';
      }

      if (reqCapType) {
        const actualType = localTypes[receiverName] || paramTypes[receiverName];
        if (actualType !== reqCapType) {
          if (!existingOffsets.has(recOffset)) {
            existingOffsets.add(recOffset);
            diags.push({ code: 10, byteOff: recOffset, byteLen: receiverName.length, name: receiverName });
          }
        }
      }
    }
  }

  return diags;
}

function findUnknownTopLevelDiags(source) {
  if (!source) return [];
  const diags = [];
  let i = 0;
  const len = source.length;
  let braceDepth = 0;

  while (i < len) {
    while (i < len && (source[i] === ' ' || source[i] === '\t' || source[i] === '\r' || source[i] === '\n')) {
      i++;
    }
    if (i >= len) break;

    if (source[i] === '#' || (source[i] === '/' && source[i + 1] === '/')) {
      while (i < len && source[i] !== '\n') i++;
      continue;
    }

    if (braceDepth > 0) {
      if (source[i] === '{') {
        braceDepth++;
        i++;
      } else if (source[i] === '}') {
        braceDepth--;
        i++;
      } else if (source[i] === '"') {
        i++;
        while (i < len && source[i] !== '"') {
          if (source[i] === '\\') i++;
          i++;
        }
        if (i < len) i++;
      } else {
        i++;
      }
      continue;
    }

    if (source[i] === '}') {
      diags.push({ code: 3, byteOff: i, byteLen: 1, name: '}' });
      i++;
      continue;
    }

    const start = i;
    if (/[a-zA-Z_]/.test(source[i])) {
      while (i < len && /[a-zA-Z0-9_]/.test(source[i])) i++;
      const word = source.slice(start, i);
      if (word === 'fn') {
        while (i < len && source[i] !== '{' && source[i] !== '\n') {
          if (source[i] === '#' || (source[i] === '/' && source[i + 1] === '/')) {
            while (i < len && source[i] !== '\n') i++;
            break;
          }
          i++;
        }
        if (i < len && source[i] === '{') {
          braceDepth = 1;
          i++;
        }
      } else if (word === 'type') {
        while (i < len && source[i] !== '\n' && source[i] !== '{') i++;
        if (i < len && source[i] === '{') {
          braceDepth = 1;
          i++;
        }
      } else {
        diags.push({ code: 3, byteOff: start, byteLen: word.length, name: word });
      }
    } else {
      diags.push({ code: 3, byteOff: start, byteLen: 1, name: source[i] });
      i++;
    }
  }

  return diags;
}

// Build the structured diagnostics from raw compiler records + the source text.
// Each diagnostic: { code, sev, line, col, span:[start,end], msg, name?, fix?:{span,text} }.
export function buildDiagnostics(rawDiags, source) {
  let diags = rawDiags ? [...rawDiags] : [];
  if (source) {
    const extraCapDiags = findCapabilityReceiverDiags(source, diags);
    if (extraCapDiags.length > 0) {
      diags = diags.concat(extraCapDiags);
    }
    if (diags.length === 0) {
      diags = findUnknownTopLevelDiags(source);
    }
  }
  return diags.map(d => {
    const reg = REGISTRY[d.code] || UNKNOWN;
    let span, fix, anchor;
    if (reg.fix === 'insert-brace') {              // position at end of input
      anchor = source.length;
      span = [source.length, source.length];
      fix = { span: [source.length, source.length], text: '\n}\n' };
    } else {
      anchor = d.byteOff;
      span = [d.byteOff, d.byteOff + d.byteLen];
      // only offer a delete-fix when the token has a real, in-range source span
      fix = (reg.fix === 'delete-span' && d.byteOff >= 0 && d.byteLen > 0 && d.byteOff + d.byteLen <= source.length)
        ? { span: [d.byteOff, d.byteOff + d.byteLen], text: '' } : undefined;
    }
    const { line, col } = lineCol(source, anchor);
    const out = { code: reg.id, sev: reg.sev, line, col, span, msg: reg.msg };
    if (d.name) out.name = d.name;
    if (fix) out.fix = fix;
    return out;
  });
}

// Apply every confident fix to the source in one pass (high offset to low so earlier
// offsets stay valid), skipping any fix that overlaps an already-applied one. Returns the
// new source and how many fixes were applied. Re-compile afterward to surface what remains.
export function applyFixes(source, diags) {
  const valid = f => f && f.span[0] >= 0 && f.span[1] >= f.span[0] && f.span[1] <= source.length;
  const fixes = diags.filter(d => valid(d.fix)).map(d => d.fix).sort((a, b) => b.span[0] - a.span[0]);
  let s = source, applied = 0, guard = Infinity;
  for (const f of fixes) {
    if (f.span[1] > guard) continue;               // overlaps a later-applied fix
    const next = s.slice(0, f.span[0]) + f.text + s.slice(f.span[1]);
    if (next === s) continue;                       // no-op fix: never count it (avoids fix loops)
    s = next; guard = f.span[0]; applied++;
  }
  return { source: s, applied };
}

export function fixableCount(diags) { return diags.filter(d => d.fix).length; }

export function explain(codeId) {
  for (const k of Object.keys(REGISTRY)) if (REGISTRY[k].id === codeId) return REGISTRY[k];
  return null;
}

// one-line human render, kept identical in spirit to the original CLI output
export function renderHuman(file, d) {
  const tail = d.name ? ` '${d.name}'` : '';
  return `${file}:${d.line}:${d.col}: ${d.sev}: ${d.msg}${tail} [${d.code}]`;
}
