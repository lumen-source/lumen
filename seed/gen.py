def generate_lumen():
    code = []
    def p(s):
        code.append(s)

    # Symbol and param tables
    p("""
fn sym_add(off: Int, len: Int, entry: Int) -> Unit {
  let base = SYMBOLS() + get_nsym() * 12
  store32(base, off)
  store32(base + 4, len)
  store32(base + 8, entry)
  set_nsym(get_nsym() + 1)
}

fn sym_find(off: Int, len: Int) -> Int {
  var k = 0
  var n = get_nsym()
  while k < n {
    let base = SYMBOLS() + k * 12
    if eqlit(load32(base), load32(base + 4), off, len) == 1 {
      return load32(base + 8)
    }
    k = k + 1
  }
  return 0 - 1
}

fn param_add(off: Int, len: Int) -> Unit {
  let base = PARAMS() + get_nparam() * 8
  store32(base, off)
  store32(base + 4, len)
  set_nparam(get_nparam() + 1)
}

fn param_find(off: Int, len: Int) -> Int {
  var k = 0
  var n = get_nparam()
  while k < n {
    let base = PARAMS() + k * 8
    if eqlit(load32(base), load32(base + 4), off, len) == 1 {
      return k
    }
    k = k + 1
  }
  return 0 - 1
}

fn local_add(off: Int, len: Int) -> Unit {
  let base = LOCALS() + get_nlocal() * 8
  store32(base, off)
  store32(base + 4, len)
  set_nlocal(get_nlocal() + 1)
}

fn local_find(off: Int, len: Int) -> Int {
  var k = 0
  var n = get_nlocal()
  while k < n {
    let base = LOCALS() + k * 8
    if eqlit(load32(base), load32(base + 4), off, len) == 1 {
      return k
    }
    k = k + 1
  }
  return 0 - 1
}

fn var_find(off: Int, len: Int) -> Int {
  let s1 = param_find(off, len)
  if s1 >= 0 { return s1 }
  let s2 = local_find(off, len)
  if s2 >= 0 { return get_nparam() + s2 }
  return 0 - 1
}

fn err_add(code: Int, off: Int, len: Int) -> Unit {
  if get_nerr() >= 800 { return }
  let base = 90000 + get_nerr() * 12
  store32(base, code)
  store32(base + 4, off)
  store32(base + 8, len)
  set_nerr(get_nerr() + 1)
}

fn fixup_add(pos: Int, off: Int, len: Int) -> Unit {
  let base = FIXUPS() + get_nfixup() * 12
  store32(base, pos)
  store32(base + 4, off)
  store32(base + 8, len)
  set_nfixup(get_nfixup() + 1)
}

fn resolve_fixups() -> Unit {
  var k = 0
  var n = get_nfixup()
  while k < n {
    let base = FIXUPS() + k * 12
    let off = load32(base + 4)
    let len = load32(base + 8)
    var entry = sym_find(off, len)
    if entry < 0 {
      err_add(2, off, len)
      entry = 0
    }
    patch(load32(base), entry)
    k = k + 1
  }
}

fn emitw(v: Int) -> Unit {
  store32(CODE() + get_emit() * 4, v)
  set_emit(get_emit() + 1)
}

fn patch(idx: Int, v: Int) -> Unit {
  store32(CODE() + idx * 4, v)
}

fn adv() -> Unit {
  set_tp(get_tp() + 1)
}

fn halloc(size: Int) -> Int {
  let p = get_hp()
  set_hp(get_hp() + size)
  return p
}

fn mktext_lit(off: Int, len: Int) -> Int {
  let ptr = get_hp()
  var w = ptr + 4
  var i = 0
  while i < len {
    var c = load8(off + i)
    if c == 92 {
      if i + 1 < len {
        if load8(off + i + 1) == 110 {
          c = 10
          i = i + 1
        }
      }
    }
    store8(w, c)
    w = w + 1
    i = i + 1
  }
  store32(ptr, w - (ptr + 4))
  set_hp(w)
  return ptr
}

fn int2text(v: Int) -> Int {
  var neg = 0
  if v < 0 {
    neg = 1
    v = 0 - v
  }
  var nd = 1
  var tmp = v
  
  var loop1 = 1
  while loop1 == 1 {
    tmp = tmp / 10
    if tmp == 0 { loop1 = 0 } else { nd = nd + 1 }
  }
  let length = nd + neg
  let ptr = halloc(4 + length)
  store32(ptr, length)
  var w = ptr + 4 + length
  
  var loop2 = 1
  while loop2 == 1 {
    w = w - 1
    store8(w, 48 + (v % 10))
    v = v / 10
    if v == 0 { loop2 = 0 }
  }
  if neg == 1 {
    store8(ptr + 4, 45)
  }
  return ptr
}

fn concat(pa: Int, pb: Int) -> Int {
  let la = load32(pa)
  let lb = load32(pb)
  let ptr = halloc(4 + la + lb)
  store32(ptr, la + lb)
  
  var i = 0
  while i < la {
    store8(ptr + 4 + i, load8(pa + 4 + i))
    i = i + 1
  }
  i = 0
  while i < lb {
    store8(ptr + 4 + la + i, load8(pb + 4 + i))
    i = i + 1
  }
  return ptr
}

fn lex(srclen: Int) -> Unit {
  var i = 0
  var n = 0
  while i < srclen {
    var c = b(i)
    var is_ws = 0
    if c == 32 { is_ws = 1 }
    if c == 10 { is_ws = 1 }
    if c == 9 { is_ws = 1 }
    if c == 13 { is_ws = 1 }
    
    if is_ws == 1 {
      i = i + 1
    } else {
      if c == 35 {
        var loop_com = 1
        while loop_com == 1 {
          if i >= srclen { loop_com = 0 } else {
            if b(i) == 10 { loop_com = 0 } else {
              i = i + 1
            }
          }
        }
      } else {
        if is_digit(c) == 1 {
          var val = 0
          var loop_dig = 1
          while loop_dig == 1 {
            if i >= srclen { loop_dig = 0 } else {
              c = b(i)
              if is_digit(c) == 0 { loop_dig = 0 } else {
                val = val * 10 + (c - 48)
                i = i + 1
              }
            }
          }
          tokset(n, 2, val, 0)
          n = n + 1
        } else {
          if is_alpha(c) == 1 {
            let start = i
            var loop_id = 1
            while loop_id == 1 {
              if i >= srclen { loop_id = 0 } else {
                c = b(i)
                var is_id_char = 0
                if is_alpha(c) == 1 { is_id_char = 1 }
                if is_digit(c) == 1 { is_id_char = 1 }
                if is_id_char == 0 { loop_id = 0 } else {
                  i = i + 1
                }
              }
            }
            tokset(n, 1, SRC() + start, i - start)
            n = n + 1
          } else {
            if c == 34 {
              i = i + 1
              let start = i
              var loop_str = 1
              while loop_str == 1 {
                if i >= srclen { loop_str = 0 } else {
                  if b(i) == 34 { loop_str = 0 } else {
                    i = i + 1
                  }
                }
              }
              tokset(n, 20, SRC() + start, i - start)
              i = i + 1
              n = n + 1
            } else {
              if c == 45 {
                var next_char = 0
                if i + 1 < srclen { next_char = b(i + 1) }
                if next_char == 62 {
                  tokset(n, 9, 0, 0)
                  i = i + 2
                } else {
                  tokset(n, 11, 0, 0)
                  i = i + 1
                }
                n = n + 1
              } else {
                if c == 60 {
                  var next_char = 0
                  if i + 1 < srclen { next_char = b(i + 1) }
                  if next_char == 61 {
                    tokset(n, 23, 0, 0)
                    i = i + 2
                  } else {
                    tokset(n, 12, 0, 0)
                    i = i + 1
                  }
                  n = n + 1
                } else {
                  if c == 62 {
                    var next_char = 0
                    if i + 1 < srclen { next_char = b(i + 1) }
                    if next_char == 61 {
                      tokset(n, 24, 0, 0)
                      i = i + 2
                    } else {
                      tokset(n, 25, 0, 0)
                      i = i + 1
                    }
                    n = n + 1
                  } else {
                    if c == 61 {
                      var next_char = 0
                      if i + 1 < srclen { next_char = b(i + 1) }
                      if next_char == 61 {
                        tokset(n, 21, 0, 0)
                        i = i + 2
                      } else {
                        tokset(n, 19, 0, 0)
                        i = i + 1
                      }
                      n = n + 1
                    } else {
                      if c == 33 {
                        var next_char = 0
                        if i + 1 < srclen { next_char = b(i + 1) }
                        if next_char == 61 {
                          tokset(n, 22, 0, 0)
                          i = i + 2
                          n = n + 1
                        }
                      } else {
                        var val = 0
                        if c == 40 { val = 3 }
                        if c == 41 { val = 4 }
                        if c == 123 { val = 5 }
                        if c == 125 { val = 6 }
                        if c == 44 { val = 7 }
                        if c == 58 { val = 8 }
                        if c == 43 { val = 10 }
                        if c == 46 { val = 13 }
                        if c == 91 { val = 15 }
                        if c == 93 { val = 16 }
                        if c == 42 { val = 17 }
                        if c == 47 { val = 18 }
                        if c == 37 { val = 26 }
                        if val != 0 {
                          tokset(n, val, 0, 0)
                          n = n + 1
                          i = i + 1
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  tokset(n, 14, 0, 0)
  set_ntok(n + 1)
}

fn skip_type() -> Unit {
  adv()
  if tk(get_tp()) == 15 {
    var loop = 1
    while loop == 1 {
      var k = tk(get_tp())
      if k == 16 { loop = 0 } else {
      if k == 14 { loop = 0 } else {
        adv()
      }}
    }
    adv()
  }
}

fn c_primary() -> Unit {
  let k = tk(get_tp())
  if k == 2 {
    emitw(1)
    emitw(ta(get_tp()))
    adv()
    return ()
  }
  if k == 20 {
    emitw(15)
    emitw(mktext_lit(ta(get_tp()), tb(get_tp())))
    adv()
    return ()
  }
  if k == 3 {
    adv()
    c_expr()
    adv()
    return ()
  }
  if k == 1 {
    let off = ta(get_tp())
    let length = tb(get_tp())
    adv()
    
    if tk(get_tp()) == 13 {
      adv()
      let moff = ta(get_tp())
      let mlen = tb(get_tp())
      adv()
      adv()
      if tk(get_tp()) != 4 {
        c_expr()
      }
      adv()
      if eqlit(moff, mlen, 52140, 5) == 1 {
        emitw(16)
      } else {
        emitw(10)
      }
      return ()
    }
    
    if tk(get_tp()) == 3 {
      adv()
      var argc = 0
      if tk(get_tp()) != 4 {
        c_expr()
        argc = 1
        var loop = 1
        while loop == 1 {
          if tk(get_tp()) != 7 {
            loop = 0
          } else {
            adv()
            c_expr()
            argc = argc + 1
          }
        }
      }
      adv()
      if eqlit(off, length, 52100, 11) == 1 { emitw(18); return () }
      if eqlit(off, length, 52120, 11) == 1 { emitw(17); return () }
      if eqlit(off, length, 52160, 5) == 1 { emitw(25); return () }
      if eqlit(off, length, 52170, 6) == 1 { emitw(26); return () }
      if eqlit(off, length, 52180, 6) == 1 { emitw(27); return () }
      if eqlit(off, length, 52190, 7) == 1 { emitw(28); return () }
      
      emitw(8)
      fixup_add(get_emit(), off, length)
      emitw(0)
      emitw(argc)
      return ()
    }
    
    var slot = var_find(off, length)
    if slot < 0 {
      err_add(1, off, length)
      slot = 0
    }
    emitw(2)
    emitw(slot)
    return ()
  }
}

fn c_mul() -> Unit {
  c_primary()
  var loop = 1
  while loop == 1 {
    let k = tk(get_tp())
    if k == 17 { adv(); c_primary(); emitw(11) } else {
    if k == 18 { adv(); c_primary(); emitw(12) } else {
    if k == 26 { adv(); c_primary(); emitw(24) } else {
      loop = 0
    }}}
  }
}

fn c_add() -> Unit {
  c_mul()
  var loop = 1
  while loop == 1 {
    let k = tk(get_tp())
    if k == 10 { adv(); c_mul(); emitw(3) } else {
    if k == 11 { adv(); c_mul(); emitw(4) } else {
      loop = 0
    }}
  }
}

fn c_cmp() -> Unit {
  c_add()
  let k = tk(get_tp())
  if k == 12 { adv(); c_add(); emitw(5); return () }
  if k == 21 { adv(); c_add(); emitw(19); return () }
  if k == 22 { adv(); c_add(); emitw(20); return () }
  if k == 23 { adv(); c_add(); emitw(21); return () }
  if k == 24 { adv(); c_add(); emitw(22); return () }
  if k == 25 { adv(); c_add(); emitw(23) }
}

fn c_expr() -> Unit {
  c_cmp()
}

fn c_block() -> Unit {
  adv()
  var loop = 1
  while loop == 1 {
    if tk(get_tp()) == 6 {
      loop = 0
    } else {
      c_stmt()
    }
  }
  adv()
}

fn c_if() -> Unit {
  adv()
  c_expr()
  emitw(6)
  let jz = get_emit()
  emitw(0)
  c_block()
  if kw_is(get_tp(), 52020, 4) == 1 {
    adv()
    emitw(7)
    let jmp = get_emit()
    emitw(0)
    patch(jz, get_emit())
    c_block()
    patch(jmp, get_emit())
  } else {
    patch(jz, get_emit())
  }
}

fn c_let() -> Unit {
  adv()
  let off = ta(get_tp())
  let len = tb(get_tp())
  adv()
  if tk(get_tp()) == 8 {
    adv()
    skip_type()
  }
  adv()
  c_expr()
  let idx = get_nlocal()
  local_add(off, len)
  emitw(14)
  emitw(get_nparam() + idx)
}

fn c_assign() -> Unit {
  let off = ta(get_tp())
  let len = tb(get_tp())
  adv()
  adv()
  c_expr()
  var slot = var_find(off, len)
  if slot < 0 {
    err_add(1, off, len)
    slot = 0
  }
  emitw(14)
  emitw(slot)
}

fn c_while() -> Unit {
  adv()
  let cond_pc = get_emit()
  c_expr()
  emitw(6)
  let jz = get_emit()
  emitw(0)
  c_block()
  emitw(7)
  emitw(cond_pc)
  patch(jz, get_emit())
}

fn c_stmt() -> Unit {
  if kw_is(get_tp(), 52070, 3) == 1 { c_let(); return () }
  if kw_is(get_tp(), 52080, 3) == 1 { c_let(); return () }
  if kw_is(get_tp(), 52050, 5) == 1 { c_while(); return () }
  if kw_is(get_tp(), 52010, 2) == 1 { c_if(); return () }
  if kw_is(get_tp(), 52030, 6) == 1 {
    adv()
    c_expr()
    emitw(9)
    return ()
  }
  if tk(get_tp()) == 1 {
    if tk(get_tp() + 1) == 19 {
      c_assign()
      return ()
    }
  }
  c_expr()
}

fn c_fn() -> Unit {
  adv()
  let foff = ta(get_tp())
  let flen = tb(get_tp())
  adv()
  sym_add(foff, flen, get_emit())
  let ismain = eqlit(foff, flen, 52060, 4)
  if ismain == 1 {
    set_main_entry(get_emit())
  }
  adv()
  set_nparam(0)
  set_nlocal(0)
  
  var loop = 1
  while loop == 1 {
    if tk(get_tp()) == 4 {
      loop = 0
    } else {
      param_add(ta(get_tp()), tb(get_tp()))
      adv()
      adv()
      skip_type()
      if tk(get_tp()) == 7 {
        adv()
      }
    }
  }
  adv()
  if tk(get_tp()) == 9 {
    adv()
    skip_type()
  }
  emitw(13)
  let reservefix = get_emit()
  emitw(0)
  c_block()
  patch(reservefix, get_nparam() + get_nlocal())
  if ismain == 1 {
    emitw(0)
  }
}

fn c_program() -> Unit {
  var loop = 1
  while loop == 1 {
    if tk(get_tp()) == 14 {
      loop = 0
    } else {
      c_fn()
    }
  }
}

var global_osp = 0
var global_csp = 0
var global_argbase = 0
var global_pc = 0

fn opush(v: Int) -> Unit {
  store32(1024 + global_osp * 8, v)
  global_osp = global_osp + 1
}

fn opop() -> Int {
  global_osp = global_osp - 1
  return load32(1024 + global_osp * 8)
}

fn getarg(i: Int) -> Unit {
  opush(load32(1024 + (global_argbase + i) * 8))
}

fn codew(idx: Int) -> Int {
  return load32(CODE() + idx * 4)
}

fn print_i64(v: Int) -> Unit {
  console.print_int(v)
}

fn console_print_helper(ptr: Int) -> Unit {
  console.print(ptr)
}

fn run(start: Int) -> Unit {
  global_pc = start
  global_osp = 0
  global_csp = 0
  global_argbase = 0
  
  var halt = 0
  while halt == 0 {
    let op = codew(global_pc)
    global_pc = global_pc + 1
    
    if op == 0 { halt = 1 } else {
    if op == 1 {
      opush(codew(global_pc))
      global_pc = global_pc + 1
    } else {
    if op == 2 {
      getarg(codew(global_pc))
      global_pc = global_pc + 1
    } else {
    if op == 3 {
      let bb = opop()
      let a = opop()
      opush(a + bb)
    } else {
    if op == 4 {
      let bb = opop()
      let a = opop()
      opush(a - bb)
    } else {
    if op == 5 {
      let bb = opop()
      let a = opop()
      var res = 0
      if a < bb { res = 1 }
      opush(res)
    } else {
    if op == 6 {
      let target = codew(global_pc)
      global_pc = global_pc + 1
      if opop() == 0 { global_pc = target }
    } else {
    if op == 7 {
      global_pc = codew(global_pc)
    } else {
    if op == 8 {
      let entry = codew(global_pc)
      let argc = codew(global_pc + 1)
      global_pc = global_pc + 2
      store32(9216 + global_csp * 8, global_pc)
      store32(9216 + global_csp * 8 + 4, global_argbase)
      global_csp = global_csp + 1
      global_argbase = global_osp - argc
      global_pc = entry
    } else {
    if op == 9 {
      let t = opop()
      global_osp = global_argbase
      opush(t)
      global_csp = global_csp - 1
      global_pc = load32(9216 + global_csp * 8)
      global_argbase = load32(9216 + global_csp * 8 + 4)
    } else {
    if op == 11 {
      let bb = opop()
      let a = opop()
      opush(a * bb)
    } else {
    if op == 12 {
      let bb = opop()
      let a = opop()
      opush(a / bb)
    } else {
    if op == 13 {
      let target = global_argbase + codew(global_pc)
      global_pc = global_pc + 1
      var loop = 1
      while loop == 1 {
        if global_osp >= target { loop = 0 } else {
          opush(0)
        }
      }
    } else {
    if op == 14 {
      let target = codew(global_pc)
      global_pc = global_pc + 1
      let t = opop()
      store32(1024 + (global_argbase + target) * 8, t)
    } else {
    if op == 15 {
      opush(codew(global_pc))
      global_pc = global_pc + 1
    } else {
    if op == 16 {
      let a = opop()
      console_print_helper(a)
    } else {
    if op == 17 {
      let bb = opop()
      let a = opop()
      opush(concat(a, bb))
    } else {
    if op == 18 {
      opush(int2text(opop()))
    } else {
    if op == 19 {
      let bb = opop()
      let a = opop()
      var res = 0
      if a == bb { res = 1 }
      opush(res)
    } else {
    if op == 20 {
      let bb = opop()
      let a = opop()
      var res = 0
      if a != bb { res = 1 }
      opush(res)
    } else {
    if op == 21 {
      let bb = opop()
      let a = opop()
      var res = 0
      if a <= bb { res = 1 }
      opush(res)
    } else {
    if op == 22 {
      let bb = opop()
      let a = opop()
      var res = 0
      if a >= bb { res = 1 }
      opush(res)
    } else {
    if op == 23 {
      let bb = opop()
      let a = opop()
      var res = 0
      if a > bb { res = 1 }
      opush(res)
    } else {
    if op == 24 {
      let t = opop()
      opush(opop() % t)
    } else {
    if op == 25 {
      opush(load8(opop()))
    } else {
    if op == 26 {
      let t = opop()
      store8(opop(), t)
      opush(0)
    } else {
    if op == 27 {
      opush(load32(opop()))
    } else {
    if op == 28 {
      let t = opop()
      store32(opop(), t)
      opush(0)
    } else {
    if op == 10 {
      print_i64(opop())
    }
    }}}}}}}}}}}}}}}}}}}}}}}}}}}}
  }
}

fn lex_compile(srclen: Int) -> Int {
  set_emit(0)
  set_nsym(0)
  set_nfixup(0)
  set_nerr(0)
  set_main_entry(0)
  set_hp(100000)
  lex(srclen)
  set_tp(0)
  c_program()
  resolve_fixups()
  return get_emit()
}

fn compile_and_run(srclen: Int) -> Unit {
  let e = lex_compile(srclen)
  run(get_main_entry())
}
""")

    return "\n".join(code)

if __name__ == "__main__":
    import os
    original_path = "/Users/freedom/QUANTS-Working-Trees/lumen-finish/projects/lumen/seed/lumenc.lm"
    with open(original_path, "r") as f:
        existing_code = f.read()
    new_code = existing_code + "\n" + generate_lumen() + "\n"
    with open(original_path, "w") as f:
        f.write(new_code)
