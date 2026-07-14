// Hidden test for t03 (text). Never shown to an author.
const EXPECTED = 'hello, lumen\n';

export async function run(compileFn, source) {
  const r = compileFn(source);
  const green = r.ok === true && r.stdout === EXPECTED;
  return { green, detail: { expected: EXPECTED, got: r.stdout, ok: r.ok } };
}
