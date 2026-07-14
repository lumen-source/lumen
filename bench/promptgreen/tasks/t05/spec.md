# t05: floats

Lumen has no float-to-text formatting in this task's scope; per house style, print floats as
a scaled Int (multiply then `round`) so the exact decimal is unambiguous in stdout. Write a
Lumen program with:

- a function `area(w: Float, h: Float) -> Float` that returns `w * h`
- a `main(console: Console) -> Unit` that prints `round(area(2.5, 4.0) * 100.0)` with
  `console.print_int` (the area scaled by 100, as an Int)

Print nothing else.
