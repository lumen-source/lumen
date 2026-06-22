;; Lumen stage-0 seed: a tiny bytecode interpreter for the Lumen-mu IR.
;; Zero-legacy: this is WebAssembly text (a compilation substrate, not a high-level
;; language). It is disposable, discarded at the self-hosting fixpoint.
;;
;; It is a stack machine with a separate call stack, enough to run recursive Lumen-mu
;; (e.g. fib). The host writes a bytecode program into linear memory at CODE_BASE and
;; calls (run <main-entry-word-index>). The single nondeterminism boundary is the
;; imported console_print (the Console capability seam); everything else is pure.
;;
;; Memory map (bytes):
;;   [1024 .. 9216)    operand stack   (i64 slots, 8 bytes each)
;;   [9216 .. 11264)   call stack      (frames of 2 x i32: return_pc, prev_argbase)
;;   [11264 .. 11328)  text scratch    (itoa buffer; ANCHOR = 11326 holds '\n')
;;   [11328 .. )       code            (i32 words: opcode, then inline operands)
;;
;; Opcodes:  0 HALT  1 PUSH n  2 GETARG i  3 ADD  4 SUB  5 LT
;;           6 JZ target  7 JMP target  8 CALL entry argc  9 RET  10 PRINTINT
(module
  (import "lumen" "console_print" (func $console_print (param i32 i32)))
  (memory (export "mem") 2)

  (global $osp     (mut i32) (i32.const 0))   ;; operand stack pointer (slot count)
  (global $csp     (mut i32) (i32.const 0))   ;; call stack pointer (frame count)
  (global $argbase (mut i32) (i32.const 0))   ;; slot index of current frame's arg 0
  (global $pc_set  (mut i32) (i32.const 0))   ;; program counter (word index)

  ;; --- operand stack (i64) ---
  (func $opush (param $v i64)
    (i64.store (i32.add (i32.const 1024) (i32.mul (global.get $osp) (i32.const 8))) (local.get $v))
    (global.set $osp (i32.add (global.get $osp) (i32.const 1))))
  (func $opop (result i64)
    (global.set $osp (i32.sub (global.get $osp) (i32.const 1)))
    (i64.load (i32.add (i32.const 1024) (i32.mul (global.get $osp) (i32.const 8)))))

  ;; --- read the i-th argument of the current frame ---
  (func $getarg (param $i i32)
    (call $opush
      (i64.load (i32.add (i32.const 1024)
        (i32.mul (i32.add (global.get $argbase) (local.get $i)) (i32.const 8))))))

  ;; --- fetch a code word at word-index idx ---
  (func $code (param $idx i32) (result i32)
    (i32.load (i32.add (i32.const 11328) (i32.mul (local.get $idx) (i32.const 4)))))

  ;; --- print a non-negative-or-negative i64 in decimal, with a trailing newline ---
  (func $print_i64 (param $v i64)
    (local $p i32) (local $neg i32)
    (i32.store8 (i32.const 11326) (i32.const 10))   ;; '\n' at ANCHOR
    (local.set $p (i32.const 11326))
    (local.set $neg (i32.const 0))
    (if (i64.lt_s (local.get $v) (i64.const 0))
      (then
        (local.set $neg (i32.const 1))
        (local.set $v (i64.sub (i64.const 0) (local.get $v)))))
    (if (i64.eqz (local.get $v))
      (then
        (local.set $p (i32.sub (local.get $p) (i32.const 1)))
        (i32.store8 (local.get $p) (i32.const 48)))      ;; '0'
      (else
        (block $done
          (loop $l
            (br_if $done (i64.eqz (local.get $v)))
            (local.set $p (i32.sub (local.get $p) (i32.const 1)))
            (i32.store8 (local.get $p)
              (i32.add (i32.const 48) (i32.wrap_i64 (i64.rem_u (local.get $v) (i64.const 10)))))
            (local.set $v (i64.div_u (local.get $v) (i64.const 10)))
            (br $l)))))
    (if (local.get $neg)
      (then
        (local.set $p (i32.sub (local.get $p) (i32.const 1)))
        (i32.store8 (local.get $p) (i32.const 45))))      ;; '-'
    (call $console_print (local.get $p) (i32.sub (i32.const 11327) (local.get $p))))

  ;; --- the interpreter ---
  (func (export "run") (param $start i32)
    (local $op i32) (local $a i64) (local $b i64) (local $t i64)
    (local $entry i32) (local $argc i32) (local $target i32)
    (global.set $pc_set (local.get $start))
    (block $halt
      (loop $loop
        (local.set $op (call $code (global.get $pc_set)))
        (global.set $pc_set (i32.add (global.get $pc_set) (i32.const 1)))

        (if (i32.eqz (local.get $op)) (then (br $halt)))                        ;; HALT

        (if (i32.eq (local.get $op) (i32.const 1)) (then                        ;; PUSH n
          (call $opush (i64.extend_i32_s (call $code (global.get $pc_set))))
          (global.set $pc_set (i32.add (global.get $pc_set) (i32.const 1)))
          (br $loop)))

        (if (i32.eq (local.get $op) (i32.const 2)) (then                        ;; GETARG i
          (call $getarg (call $code (global.get $pc_set)))
          (global.set $pc_set (i32.add (global.get $pc_set) (i32.const 1)))
          (br $loop)))

        (if (i32.eq (local.get $op) (i32.const 3)) (then                        ;; ADD
          (local.set $b (call $opop)) (local.set $a (call $opop))
          (call $opush (i64.add (local.get $a) (local.get $b)))
          (br $loop)))

        (if (i32.eq (local.get $op) (i32.const 4)) (then                        ;; SUB
          (local.set $b (call $opop)) (local.set $a (call $opop))
          (call $opush (i64.sub (local.get $a) (local.get $b)))
          (br $loop)))

        (if (i32.eq (local.get $op) (i32.const 5)) (then                        ;; LT
          (local.set $b (call $opop)) (local.set $a (call $opop))
          (call $opush (i64.extend_i32_u (i64.lt_s (local.get $a) (local.get $b))))
          (br $loop)))

        (if (i32.eq (local.get $op) (i32.const 6)) (then                        ;; JZ target
          (local.set $target (call $code (global.get $pc_set)))
          (global.set $pc_set (i32.add (global.get $pc_set) (i32.const 1)))
          (if (i64.eqz (call $opop)) (then (global.set $pc_set (local.get $target))))
          (br $loop)))

        (if (i32.eq (local.get $op) (i32.const 7)) (then                        ;; JMP target
          (global.set $pc_set (call $code (global.get $pc_set)))
          (br $loop)))

        (if (i32.eq (local.get $op) (i32.const 8)) (then                        ;; CALL entry argc
          (local.set $entry (call $code (global.get $pc_set)))
          (local.set $argc  (call $code (i32.add (global.get $pc_set) (i32.const 1))))
          (global.set $pc_set (i32.add (global.get $pc_set) (i32.const 2)))      ;; = return pc
          ;; push frame [return_pc, prev_argbase]
          (i32.store (i32.add (i32.const 9216) (i32.mul (global.get $csp) (i32.const 8)))
                     (global.get $pc_set))
          (i32.store (i32.add (i32.add (i32.const 9216) (i32.mul (global.get $csp) (i32.const 8))) (i32.const 4))
                     (global.get $argbase))
          (global.set $csp (i32.add (global.get $csp) (i32.const 1)))
          (global.set $argbase (i32.sub (global.get $osp) (local.get $argc)))
          (global.set $pc_set (local.get $entry))
          (br $loop)))

        (if (i32.eq (local.get $op) (i32.const 9)) (then                        ;; RET
          (local.set $t (call $opop))                       ;; return value
          (global.set $osp (global.get $argbase))           ;; discard args + temps
          (call $opush (local.get $t))                      ;; push result
          (global.set $csp (i32.sub (global.get $csp) (i32.const 1)))
          (global.set $pc_set (i32.load (i32.add (i32.const 9216) (i32.mul (global.get $csp) (i32.const 8)))))
          (global.set $argbase (i32.load (i32.add (i32.add (i32.const 9216) (i32.mul (global.get $csp) (i32.const 8))) (i32.const 4))))
          (br $loop)))

        (if (i32.eq (local.get $op) (i32.const 10)) (then                       ;; PRINTINT
          (call $print_i64 (call $opop))
          (br $loop)))

        (br $halt)))                                                            ;; unknown -> stop
  )
)
