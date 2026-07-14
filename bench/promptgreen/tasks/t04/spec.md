# t04: bools

There is no `Bool` type in Lumen; comparisons produce a truth value that `if` and `and`/`or`
consume directly. Write a Lumen program with:

- a function `in_range(x: Int, lo: Int, hi: Int) -> Int` returning `1` if `x >= lo and
  x <= hi`, else `0`
- a `main(console: Console) -> Unit` that prints `in_range(5, 1, 10)` then
  `in_range(15, 1, 10)`, each with `console.print_int`

Print nothing else.
