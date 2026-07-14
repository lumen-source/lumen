// Hidden test for t10 (byte kernel: load8/store8). Never shown to an author.
const EXPECTED = '60\n';

export async function run(compileFn, source) {
  const r = compileFn(source);
  const green = r.ok === true && r.stdout === EXPECTED;
  return { green, detail: { expected: EXPECTED, got: r.stdout, ok: r.ok } };
}
