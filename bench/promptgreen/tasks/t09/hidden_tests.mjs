// Hidden test for t09 (pricing-flavored: present value). Never shown to an author.
const EXPECTED = '10000\n';

export async function run(compileFn, source) {
  const r = compileFn(source);
  const green = r.ok === true && r.stdout === EXPECTED;
  return { green, detail: { expected: EXPECTED, got: r.stdout, ok: r.ok } };
}
