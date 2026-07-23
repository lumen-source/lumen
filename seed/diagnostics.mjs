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
};
const UNKNOWN = { id: 'E0000', sev: 'error', msg: 'error', fix: null, explain: 'Unclassified compiler error.' };

function lineCol(source, off) {
  off = Math.max(0, Math.min(off, source.length));
  let line = 1, col = 1;
  for (let i = 0; i < off; i++) { if (source.charCodeAt(i) === 10) { line++; col = 1; } else col++; }
  return { line, col };
}

// Build the structured diagnostics from raw compiler records + the source text.
// Each diagnostic: { code, sev, line, col, span:[start,end], msg, name?, fix?:{span,text} }.
export function buildDiagnostics(rawDiags, source) {
  return rawDiags.map(d => {
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
