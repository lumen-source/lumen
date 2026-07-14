# t07: records

Write a Lumen program with:

- `type Point = { x: Float, y: Float }`
- a function `dist_sq(p: Point) -> Float` returning `p.x * p.x + p.y * p.y`
- a `main(console: Console) -> Unit` that constructs `Point { x: 3.0, y: 4.0 }` and prints
  `round(dist_sq(p))` with `console.print_int`

Print nothing else.
