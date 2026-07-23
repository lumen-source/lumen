# Lumen Language Reference (seed interpreter)

This describes the **currently runnable subset of Lumen** (called "Lumen-mu", the seed interpreter). If you are writing a Lumen program, use only the features documented here; everything on this page is verified by the conformance test suite (`seed/` and `examples/`). The broader language vision lives in `docs/`, but only what is documented here will compile and run today.

## Run a program

```
./lumen run   program.lm     # compile and run, print output
./lumen check program.lm     # compile only; report ok or where it failed
./lumen ir    program.lm     # print the compiled IR (for inspection)
```
(First time only: `cd seed && npm install` to fetch the WebAssembly runtime.)

## Program shape

Every program is a list of top-level function definitions. Execution starts at `main`, which receives the `Console` capability:

```lumen
fn main(console: Console) -> Unit {
  console.print("hello, world\n")
}
```

Functions may be defined in **any order**: forward references and mutual recursion both work.

## Comments

```lumen
# everything after a hash on a line is a comment
```

## Types

- `Int` : 64-bit signed integer. Literals: `0`, `42`, `-100`, `1000000`.
- `Float` : 64-bit IEEE double-precision. Literals: `3.14`, `1.0`, `2e10`. Automatic coercion from Int in mixed arithmetic (e.g., `3 + 2.5` treats `3` as `3.0`).
- `Text` : UTF-8 string. Literals: `"hello"`, `"line one\n"` (only `\n` escapes; no other escapes). Text is immutable.
- `Unit` : the empty type; a function that returns nothing declares `-> Unit`.
- `Console` : the I/O capability that lets a function print. Only `main` receives it; pass it down to helpers that need to print.
- **Sum types** (user-defined): `type Color = | Red | Green | Blue` creates a tagged union. Variants can carry data: `type Shape = | Circle(Float) | Rect(Float, Float)`.
- **Result** (built-in generic): `Result[T, E]` represents success `Ok(value: T)` or failure `Err(error: E)`. Use with the `?` operator.
- **Records** (user-defined): `type Point = { x: Float, y: Float }` creates a struct. Construct with `Point { x: 1.0, y: 2.0 }` and access fields with dot notation (`p.x`).
- **Float arrays** (heap-backed): `array(n)` allocates an array of `n` floats; `aget(arr, i)` reads index `i`; `aset(arr, i, v)` writes; `alen(arr)` returns the length.

- `Bool` (B1): a distinct type, not an Int alias. Literals: `true`, `false`. A comparison (`a < b`, `a == b`, ...) produces a `Bool`, which `if`, `while`, `and`, `or`, and `not` require. `Bool` never implicitly or explicitly coerces to/from `Int` (or `Float`/`Dec`): `if x` where `x` is an `Int` is a compile-time error (E0009), not a truthiness test. `==`/`!=` between two `Bool` values is allowed; ordering comparisons (`<`, `<=`, `>`, `>=`) and arithmetic (`+`, `-`, `*`, `/`) on `Bool` are not.

## Dec: exact decimal arithmetic

`Dec` is an exact fixed-point decimal type for money and other values where binary-float
rounding error is unacceptable (`0.1 + 0.2` as `Float` is `0.30000000000000004`; as `Dec` it
is exactly `0.3`). Internally a `Dec` is a signed 64-bit integer holding the value scaled by
1,000,000 (six decimal places, the scale floor / smallest representable unit is `0.000001`).
There is no arbitrary-precision fallback: `Dec` is fixed-scale, fixed-width, and every
operation traps (aborts) on overflow rather than silently wrapping or losing precision.

**Literals.** A `Dec` literal is a decimal number followed by `d`: `1.50d`, `-3d` (no
fractional part needed), `0.000001d` (the smallest nonzero magnitude), `9223372036854d` (the
largest whole-number literal that fits: see Overflow below). Internally the literal's decimal
text is parsed and multiplied by 1,000,000 at compile time; there is no runtime parsing cost.

**Operators.** `+`, `-`, `*`, unary `-`, and the comparisons (`<`, `<=`, `>`, `>=`, `==`, `!=`)
all work directly on `Dec`. Division is deliberately NOT available via `/`: a bare `/` on two
`Dec` operands is a compile-time diagnostic, because binary division of a fixed-scale decimal
is where silent precision loss (or an implicit choice of rounding mode) most often hides. Use
the explicit `dec_div` builtin instead, which makes the rounding rule visible at the call site.

**`Dec` and `Float` never mix.** There is no implicit or explicit conversion path between the
two that would let a `Dec` computation silently pick up binary-float error partway through, or
vice versa. Use `dec_to_float` for an explicit, intentionally lossy escape hatch when a `Dec`
value must feed a `Float`-only computation (e.g. a math-library call).

**`Int` coerces to `Dec` automatically**, in either operand order, wherever a `Dec` is
expected: `3 + 19.99d` and `19.99d + 3` both coerce the bare `Int` to `Dec` and produce
`22.99`; `dec_to_text(5)` coerces `5` to `5.0`. This coercion is the one deliberate exception
to the "no implicit numeric conversion" rule above, because an `Int` embeds exactly into
`Dec`'s scale with zero information loss (multiply by 1,000,000; contrast with `Dec -> Float`,
which is lossy in the general case).

**Rounding: round-half-even ("banker's rounding"), applied only where an operation's true
result would need a **finer** grain than the fixed 1e-6 scale.** `+` and `-` are always exact
(no rounding: two scale-1e-6 integers added or subtracted stay exact at scale 1e-6). `*`
computes the exact product before scaling back down to 1e-6, rounding half-to-even at that
last step; `dec_div(a, b)` computes the exact quotient at scale 1e-6, rounding half-to-even the
same way. Half-even means an exact `.5` at the discarded digit rounds to whichever neighbor has
an even last digit, not always up; this avoids the small systematic upward bias that
round-half-up accumulates over many operations, which is why it is the default rounding mode
in `decimal.Decimal` (Python) and most financial-decimal libraries.

**Overflow and traps.** Every `Dec` operation is bounds-checked and aborts the program (does
not return, does not wrap) if the true result cannot be represented:
- `DADD`/`DSUB` (`+`/`-` on two `Dec`s): trap on signed 64-bit overflow of the underlying
  scaled integer, **and explicitly check for a result landing exactly on `INT64_MIN`**
  (`-9223372036854775808`) even though that value would technically fit in 64 bits; this is
  because `Dec`'s valid range excludes `INT64_MIN` (see below), and `__builtin_add_overflow`/
  `__builtin_sub_overflow` alone cannot see that boundary; both native lowerings (`emit_fn.lm`
  and `emit_llvm.lm`) add the explicit `==INT64_MIN` check on top of the hardware overflow flag
  for exactly this reason.
- `DMUL` (`*`): the product is computed at full width (128-bit intermediate) before scaling
  back down, so it never overflows during multiplication itself; it traps only if the final
  scaled-and-rounded result falls outside the valid range.
- `dec_div` (`DDIV`): traps on division by zero, and on the same out-of-range result check as
  `DMUL`.
- `DFROMI` (the implicit `Int -> Dec` coercion): traps if `|value| > 9223372036854` (that is,
  `floor(INT64_MAX / 1,000,000)` on the positive side; the negative bound is the mirror image).
  This bound is what makes `9223372036854d` the largest whole-number `Dec` literal: one unit
  more and the scaled value would not fit. **`Dec`'s valid range excludes `INT64_MIN`
  itself** (`-9223372036854775808`), so unlike `DADD`/`DSUB` there is no separate explicit
  `INT64_MIN` check needed inside `DFROMI`: the `|value| > 9223372036854` bound already
  excludes it by construction (`9223372036854 * 1,000,000 = 9223372036854000000`, which is
  strictly greater in magnitude than `INT64_MIN`'s scaled equivalent could ever reach through
  this coercion path, since the coercion multiplies a bounded `Int` rather than landing on the
  boundary integer directly); the exclusion is implied by the divisibility of the bound, not
  enforced by a second explicit comparison the way `DADD`/`DSUB` need one.

**Formatting (`dec_to_text`).** Prints the canonical decimal form: fixed at up to six
fractional digits, trailing zeros stripped, but always at least one fractional digit (`3d`
prints as `"3.0"`, not `"3"`; `0.000001d` prints as `"0.000001"`, not stripped further since
its one nonzero digit is the last one).

**Builtins:**
- `dec_div(a: Dec, b: Int | Dec) -> Dec` : the only division path for `Dec`. Traps on `b == 0`
  or on an out-of-range result.
- `dec_to_text(d: Dec) -> Text` : canonical decimal string (see Formatting above). Also accepts
  a bare `Int` argument via the same `Int -> Dec` coercion as everywhere else.
- `dec_to_float(d: Dec) -> Float` : explicit, intentionally lossy conversion to `Float`. The
  only way to move a `Dec` value into `Float`-only code (e.g. `sqrt`, `exp`).

```lumen
fn account_value(principal: Dec, rate: Dec) -> Dec {
  return principal + dec_div(principal * rate, 100)
}

fn main(c: Console) -> Unit {
  c.print(dec_to_text(0.1d + 0.2d))         # "0.3" - exact, unlike Float
  c.print("\n")
  c.print(dec_to_text(account_value(1000.00d, 5.00d)))  # "1050.0"
}
```

See `mu/examples/decimal.lm` for the full worked transcript (every operator, both coercion
orders, both half-even tie directions, and the overflow traps) and
`examples/finance/accrual_dec.lm` for a small day-count accrued-interest kernel built on it.

## Functions

```lumen
fn add(a: Int, b: Int) -> Int {
  return a + b
}

fn greet(name: Text) -> Text {
  return text_concat("hello, ", name)
}
```

Every parameter is explicitly typed. Every function declares a return type (use `-> Unit` if it returns nothing). Every code path in a non-`Unit` function must end with `return <expr>`.

## Locals and binding

```lumen
let x = 42              # immutable binding; x cannot be reassigned
var y = 0              # mutable binding; y can be reassigned
y = y + 1              # reassignment (only with var)
```

`let` is the default; use `var` only when you need to reassign.

## Control flow

### if / else if / else

```lumen
if x < 0 {
  return "negative"
} else if x == 0 {
  return "zero"
} else {
  return "positive"
}
```

### while loops

```lumen
var sum = 0
var i = 1
while i <= 10 {
  sum = sum + i
  i = i + 1
}
return sum
```

### Recursion

Functions can call themselves or other functions recursively. Forward references work: you can call a function defined later in the file.

```lumen
fn fib(n: Int) -> Int {
  if n < 2 { return n }
  return fib(n - 1) + fib(n - 2)
}
```

### match expressions (exhaustive)

Match a sum type or compare a tuple pattern:

```lumen
type Status = | Ok | Error(Text)

fn describe(s: Status) -> Text {
  match s {
    Ok -> "success"
    Error(msg) -> text_concat("failed: ", msg)
  }
}

# Match on tuples (e.g., to classify pairs of remainders)
fn fizzbuzz_word(n: Int) -> Text {
  match (n % 3, n % 5) {
    (0, 0) -> "FizzBuzz"
    (0, _) -> "Fizz"
    (_, 0) -> "Buzz"
    (_, _) -> int_to_text(n)
  }
}
```

Match arms must be exhaustive (cover all cases).

## Operators

### Arithmetic

- `+`, `-`, `*`, `/`, `%` (modulo)
- `*`, `/`, `%` bind tighter than `+`, `-` (standard precedence)
- Division by zero traps (runtime error)
- Mixed Int/Float arithmetic: integers are automatically coerced to Float.
- Unary minus: `-n` (negates a numeric value).

```lumen
let area = (w + 1.0) * (h + 1.0)
let neg = -x
```

### Comparison

- `<`, `<=`, `>`, `>=`, `==`, `!=`
- Lower precedence than arithmetic
- Do not chain comparisons: write `a < b and b < c`, not `a < b < c`.

```lumen
if x == 0 { return "zero" }
if x > 0 and x < 10 { return "single digit positive" }
```

### Logical (short-circuit)

- `and` : short-circuits to false if the left side is false
- `or` : short-circuits to true if the left side is true
- `not` : logical negation

```lumen
if x > 0 and x < 10 { ... }   # if x <= 0, the right side is not evaluated
if valid or fallback { ... }
if not done { ... }
```

### Function calls

Functions can be called before they are defined:

```lumen
let result = helper(42)

fn helper(n: Int) -> Int {
  return n * 2
}

fn main(console: Console) -> Unit {
  console.print_int(result)
}
```

Parentheses group expressions: `(a + b) * c`.

## Built-in functions

### Console I/O

- `console.print(t: Text) -> Unit` : print text exactly (include `\n` for newline).
- `console.print_int(n: Int) -> Unit` : print integer in decimal followed by newline.

### Type conversion

- `int_to_text(n: Int) -> Text` : convert Int to decimal Text.
- `to_int(t: Text) -> Int` : parse Text as decimal (trap on invalid input).
- `to_float(n: Int) -> Float` : convert Int to Float (exact for small integers).
- `round(f: Float) -> Int` : round Float to nearest Int (banker's rounding).

### Text operations

- `text_concat(a: Text, b: Text) -> Text` : concatenate two texts.
- `text_eq(a: Text, b: Text) -> Int` : return 1 if equal, 0 otherwise.

### Math functions (f64 IEEE, POSIX libm)

- `sqrt(x: Float) -> Float` : square root.
- `abs(x: Float) -> Float` : absolute value (works on Int and Float).
- `exp(x: Float) -> Float` : e^x.
- `ln(x: Float) -> Float` : natural logarithm.
- `pow(x: Float, y: Float) -> Float` : x raised to power y.

### Raw memory (unsafe)

For low-level operations, direct memory access via 32-bit words:

- `load32(addr: Int) -> Int` : read a 32-bit word from memory address.
- `store32(addr: Int, value: Int) -> Unit` : write a 32-bit word.
- `load8(addr: Int) -> Int` : read a byte.
- `store8(addr: Int, value: Int) -> Unit` : write a byte.

### Result and the ? operator

The `?` operator short-circuits out of a function, propagating an error:

```lumen
type Error = { code: Int, message: Text }

fn read_config(path: Text) -> Result[Text, Error] {
  let content = read_file(path)?   # if read_file returns Err, the whole function returns that Err
  return Ok(content)
}
```

Use `match` to handle Results:

```lumen
match read_config("file.txt") {
  Ok(data) -> console.print(data)
  Err(e) -> console.print(e.message)
}
```

## Example: FizzBuzz

```lumen
fn classify(n: Int) -> Text {
  match (n % 3, n % 5) {
    (0, 0) -> "FizzBuzz"
    (0, _) -> "Fizz"
    (_, 0) -> "Buzz"
    (_, _) -> int_to_text(n)
  }
}

fn main(console: Console) -> Unit {
  var i = 1
  while i <= 15 {
    console.print(classify(i))
    console.print("\n")
    i = i + 1
  }
}
```

## Example: Black-Scholes (real numeric kernel)

```lumen
fn norm_cdf(x: Float) -> Float {
  let a1 = 0.254829592
  let a2 = -0.284496736
  let a3 = 1.421413741
  let a4 = -1.453152027
  let a5 = 1.061405429
  let p = 0.3275911
  let sign = if x >= 0.0 { 1.0 } else { -1.0 }
  let x = abs(x) / sqrt(2.0)
  let t = 1.0 / (1.0 + p * x)
  let y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * exp(-x * x)
  return 0.5 * (1.0 + sign * y)
}

fn call_price(s: Float, k: Float, t: Float, r: Float, sigma: Float) -> Float {
  let d1 = (ln(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqrt(t))
  let d2 = d1 - sigma * sqrt(t)
  return s * norm_cdf(d1) - k * exp(-r * t) * norm_cdf(d2)
}

fn main(console: Console) -> Unit {
  let price = call_price(100.0, 100.0, 1.0, 0.05, 0.2)
  console.print("call price: ")
  console.print_int(round(price))
}
```

## Not in this subset (do not use)

- Generics (except `Result`).
- Imports and modules.
- I/O beyond `console.print` (no file I/O, sockets, network).
- Boolean literals (`true` / `false`). Use comparisons and `if` instead.
- Tuple types (only tuple pattern matching in `match`).
- Inheritance, traits, or method definitions.
- String interpolation (use `text_concat` and `int_to_text`).
- Exception handling (`try`/`catch`). Use `Result` and `?` instead.
- `for` loops (use `while` or recursion).

Using any of these will fail to compile with a structured diagnostic. Capture the error as a test case if it represents reasonable intent.
