// Hidden test for t04 (bools). Never shown to an author.
const EXPECTED = '1\n0\n';

export async function run(compileFn, source) {
  const r = compileFn(source);
  const green = r.ok === true && r.stdout === EXPECTED;
  return { green, detail: { expected: EXPECTED, got: r.stdout, ok: r.ok } };
}
