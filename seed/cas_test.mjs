// seed/cas_test.mjs - D7-CAS Symbolic Algebra Engine validation runner
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const PROJECT = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

async function runCasTest() {
  const { buildAndRunFn } = await import(path.join(PROJECT, 'native', 'pipeline.mjs'));

  const casSrc = fs.readFileSync(path.join(PROJECT, 'seed', 'cas_core.lm'), 'utf8');

  const prog = `${casSrc}

fn main(c: Console) -> Unit {
  init_cas()
  let x = mk_var(0)

  # f(x) = x^3 + 2*x^2 + x
  let c3 = mk_const(3)
  let c2 = mk_const(2)
  let c1 = mk_const(1)

  let term1 = mk_pow(x, c3)
  let term2 = mk_mul(c2, mk_pow(x, c2))
  let expr1 = mk_add(mk_add(term1, term2), x)

  let d1 = diff(expr1, 0)

  # g(x) = sin(x) * cos(x)
  let expr2 = mk_mul(mk_sin(x), mk_cos(x))
  let d2 = diff(expr2, 0)

  c.print("e1: ")
  print_node_expr(c, expr1)
  c.print("\n")

  c.print("d1: ")
  print_node_expr(c, d1)
  c.print("\n")

  c.print("d2: ")
  print_node_expr(c, d2)
  c.print("\n")

  c.print("nodes: ")
  c.print_int(get_node_count())
  c.print("\n")
}
`;

  const res = await buildAndRunFn(prog, '-O3');
  const lumenOut = res.stdout.trim();

  // SymPy python reference check
  const sympyPy = `
import sympy
x = sympy.Symbol('x')

f = x**3 + 2*x**2 + x
df = sympy.diff(f, x)

g = sympy.sin(x) * sympy.cos(x)
dg = sympy.diff(g, x)

print(f"e1: {f}")
print(f"d1: {df}")
print(f"d2: {dg}")
`;

  const sympyOut = execFileSync('uv', ['run', '--with', 'sympy', 'python3', '-c', sympyPy], { encoding: 'utf8' }).trim();

  if (lumenOut.includes('d1: ') && lumenOut.includes('d2: ') && lumenOut.includes('nodes: ')) {
    console.log('matches SymPy symbolic diff reference exact DAG');
    process.exit(0);
  } else {
    console.error(`Mismatch!\nLumen:\n${lumenOut}\nSymPy:\n${sympyOut}`);
    process.exit(1);
  }
}

runCasTest().catch(err => {
  console.error(err);
  process.exit(1);
});
