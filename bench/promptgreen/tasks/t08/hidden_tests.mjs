// Hidden test for t08 (sum types + match + ?). Never shown to an author.
const EXPECTED = 'ok 5\ndiv by zero\n';

export async function run(compileFn, source) {
  const r = compileFn(source);
  const green = r.ok === true && r.stdout === EXPECTED;
  return { green, detail: { expected: EXPECTED, got: r.stdout, ok: r.ok } };
}
