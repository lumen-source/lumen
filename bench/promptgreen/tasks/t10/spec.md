# t10: byte kernel

Write a Lumen program with a `main(console: Console) -> Unit` that:

- writes the bytes `10`, `20`, `30` with `store8` at addresses `524400`, `524401`, `524402`
- reads them back with `load8` and sums the three values
- prints the sum with `console.print_int`

Print nothing else.
