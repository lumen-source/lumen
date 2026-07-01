	.build_version macos, 26, 0	sdk_version 26, 5
	.section	__TEXT,__text,regular,pure_instructions
	.globl	_main                           ; -- Begin function main
	.p2align	2
_main:                                  ; @main
	.cfi_startproc
; %bb.0:
	stp	d15, d14, [sp, #-96]!           ; 16-byte Folded Spill
	stp	d13, d12, [sp, #16]             ; 16-byte Folded Spill
	stp	d11, d10, [sp, #32]             ; 16-byte Folded Spill
	stp	d9, d8, [sp, #48]               ; 16-byte Folded Spill
	stp	x20, x19, [sp, #64]             ; 16-byte Folded Spill
	stp	x29, x30, [sp, #80]             ; 16-byte Folded Spill
	add	x29, sp, #80
	.cfi_def_cfa w29, 16
	.cfi_offset w30, -8
	.cfi_offset w29, -16
	.cfi_offset w19, -24
	.cfi_offset w20, -32
	.cfi_offset b8, -40
	.cfi_offset b9, -48
	.cfi_offset b10, -56
	.cfi_offset b11, -64
	.cfi_offset b12, -72
	.cfi_offset b13, -80
	.cfi_offset b14, -88
	.cfi_offset b15, -96
Lloh0:
	adrp	x8, ___stdoutp@GOTPAGE
Lloh1:
	ldr	x8, [x8, ___stdoutp@GOTPAGEOFF]
Lloh2:
	ldr	x0, [x8]
	mov	x1, #0                          ; =0x0
	mov	w2, #2                          ; =0x2
	mov	x3, #0                          ; =0x0
	bl	_setvbuf
	mov	x19, #0                         ; =0x0
	mov	x8, #35898                      ; =0x8c3a
	movk	x8, #57904, lsl #16
	movk	x8, #31118, lsl #32
	movk	x8, #15941, lsl #48
	movi.2d	v9, #0000000000000000
	fmov	d10, x8
	mov	x8, #-7378697629483820647       ; =0x9999999999999999
	movk	x8, #39322
	movk	x8, #16329, lsl #48
	fmov	d11, x8
	mov	x8, #-7378697629483820647       ; =0x9999999999999999
	movk	x8, #39322
	movk	x8, #16297, lsl #48
	fmov	d13, x8
	mov	x8, #4636737291354636288        ; =0x4059000000000000
	fmov	d14, x8
	mov	x8, #38450                      ; =0x9632
	movk	x8, #18946, lsl #16
	movk	x8, #51166, lsl #32
	movk	x8, #49239, lsl #48
	fmov	d15, x8
	mov	w20, #33920                     ; =0x8480
	movk	w20, #30, lsl #16
LBB0_1:                                 ; =>This Inner Loop Header: Depth=1
	ucvtf	d0, x19
	fmul	d0, d0, d10
	fadd	d1, d0, d11
	fmul	d0, d1, d1
	fmov	d2, #0.50000000
	fmul	d0, d0, d2
	fadd	d0, d0, d13
	fdiv	d0, d0, d1
	fsub	d8, d0, d1
	bl	_f0
	fmul	d12, d0, d14
	mov.16b	v0, v8
	bl	_f0
	fmul	d0, d0, d15
	fadd	d0, d12, d0
	fadd	d9, d9, d0
	add	x19, x19, #1
	cmp	x19, x20
	b.ne	LBB0_1
; %bb.2:
	mov	x8, #4636737291354636288        ; =0x4059000000000000
	fmov	d0, x8
	fmul	d0, d9, d0
	fmov	d1, #0.50000000
	fadd	d0, d0, d1
	frintm	d0, d0
	bl	_f2i_sat
	bl	_pic
	mov	w0, #0                          ; =0x0
	bl	_exit
	.loh AdrpLdrGotLdr	Lloh0, Lloh1, Lloh2
	.cfi_endproc
                                        ; -- End function
	.p2align	2                               ; -- Begin function f2i_sat
_f2i_sat:                               ; @f2i_sat
	.cfi_startproc
; %bb.0:
	fcmp	d0, d0
	b.vs	LBB1_4
; %bb.1:
	mov	x8, #4890909195324358656        ; =0x43e0000000000000
	fmov	d1, x8
	fcmp	d0, d1
	b.ge	LBB1_3
; %bb.2:
	mov	x8, #-9223372036854775808       ; =0x8000000000000000
	mov	x9, #-4332462841530417152       ; =0xc3e0000000000000
	fmov	d1, x9
	fcmp	d0, d1
	fcvtzs	x9, d0
	csel	x0, x8, x9, mi
	ret
LBB1_3:
	mov	x0, #9223372036854775807        ; =0x7fffffffffffffff
	ret
LBB1_4:
	mov	x0, #0                          ; =0x0
	ret
	.cfi_endproc
                                        ; -- End function
	.p2align	2                               ; -- Begin function pic
_pic:                                   ; @pic
	.cfi_startproc
; %bb.0:
	sub	sp, sp, #64
	stp	x20, x19, [sp, #32]             ; 16-byte Folded Spill
	stp	x29, x30, [sp, #48]             ; 16-byte Folded Spill
	add	x29, sp, #48
	.cfi_def_cfa w29, 16
	.cfi_offset w30, -8
	.cfi_offset w29, -16
	.cfi_offset w19, -24
	.cfi_offset w20, -32
Lloh3:
	adrp	x8, ___stack_chk_guard@GOTPAGE
Lloh4:
	ldr	x8, [x8, ___stack_chk_guard@GOTPAGEOFF]
Lloh5:
	ldr	x8, [x8]
	str	x8, [sp, #24]
	tbnz	x0, #63, LBB2_3
; %bb.1:
	cbnz	x0, LBB2_4
; %bb.2:
	mov	w0, #48                         ; =0x30
	bl	_putchar
	b	LBB2_8
LBB2_3:
	mov	x19, x0
	mov	w0, #45                         ; =0x2d
	bl	_putchar
	neg	x0, x19
LBB2_4:
	mov	x8, #0                          ; =0x0
	mov	x9, #-3689348814741910324       ; =0xcccccccccccccccc
	movk	x9, #52429
	mov	w10, #10                        ; =0xa
	mov	x11, sp
LBB2_5:                                 ; =>This Inner Loop Header: Depth=1
	umulh	x12, x0, x9
	lsr	x12, x12, #3
	msub	w13, w12, w10, w0
	orr	w13, w13, #0x30
	strb	w13, [x11, x8]
	add	x8, x8, #1
	cmp	x0, #9
	mov	x0, x12
	b.hi	LBB2_5
; %bb.6:
	sxtw	x8, w8
	mov	x9, sp
	sub	x19, x9, #1
LBB2_7:                                 ; =>This Inner Loop Header: Depth=1
	sub	x20, x8, #1
	ldrsb	w0, [x19, x8]
	bl	_putchar
	mov	x8, x20
	cbnz	x20, LBB2_7
LBB2_8:
	ldr	x8, [sp, #24]
Lloh6:
	adrp	x9, ___stack_chk_guard@GOTPAGE
Lloh7:
	ldr	x9, [x9, ___stack_chk_guard@GOTPAGEOFF]
Lloh8:
	ldr	x9, [x9]
	cmp	x9, x8
	b.ne	LBB2_10
; %bb.9:
	mov	w0, #10                         ; =0xa
	ldp	x29, x30, [sp, #48]             ; 16-byte Folded Reload
	ldp	x20, x19, [sp, #32]             ; 16-byte Folded Reload
	add	sp, sp, #64
	b	_putchar
LBB2_10:
	bl	___stack_chk_fail
	.loh AdrpLdrGotLdr	Lloh3, Lloh4, Lloh5
	.loh AdrpLdrGotLdr	Lloh6, Lloh7, Lloh8
	.cfi_endproc
                                        ; -- End function
	.p2align	2                               ; -- Begin function f0
_f0:                                    ; @f0
	.cfi_startproc
; %bb.0:
	stp	d9, d8, [sp, #-32]!             ; 16-byte Folded Spill
	stp	x29, x30, [sp, #16]             ; 16-byte Folded Spill
	add	x29, sp, #16
	.cfi_def_cfa w29, 16
	.cfi_offset w30, -8
	.cfi_offset w29, -16
	.cfi_offset b8, -24
	.cfi_offset b9, -32
	fcmp	d0, #0.0
	b.mi	LBB3_2
; %bb.1:
	mov	x8, #4110                       ; =0x100e
	movk	x8, #6257, lsl #16
	movk	x8, #42609, lsl #32
	movk	x8, #16333, lsl #48
	fmov	d1, x8
	fmul	d1, d0, d1
	fmov	d2, #1.00000000
	fadd	d1, d1, d2
	fdiv	d1, d2, d1
	mov	x8, #10563                      ; =0x2943
	movk	x8, #55028, lsl #16
	movk	x8, #18637, lsl #32
	movk	x8, #16373, lsl #48
	fmov	d2, x8
	fmul	d2, d1, d2
	mov	x8, #30928                      ; =0x78d0
	movk	x8, #20210, lsl #16
	movk	x8, #9181, lsl #32
	movk	x8, #49149, lsl #48
	fmov	d3, x8
	fadd	d2, d2, d3
	fmul	d2, d1, d2
	mov	x8, #24168                      ; =0x5e68
	movk	x8, #607, lsl #16
	movk	x8, #33007, lsl #32
	movk	x8, #16380, lsl #48
	fmov	d3, x8
	fadd	d2, d2, d3
	fmul	d2, d1, d2
	mov	x8, #12891                      ; =0x325b
	movk	x8, #58792, lsl #16
	movk	x8, #53744, lsl #32
	movk	x8, #49110, lsl #48
	fmov	d3, x8
	fadd	d2, d2, d3
	fmul	d2, d1, d2
	mov	x8, #63724                      ; =0xf8ec
	movk	x8, #14994, lsl #16
	movk	x8, #28863, lsl #32
	movk	x8, #16340, lsl #48
	fmov	d3, x8
	fadd	d2, d2, d3
	fmul	d8, d1, d2
	fmul	d0, d0, d0
	movi.2d	v1, #0000000000000000
	fsub	d0, d1, d0
	fmov	d1, #0.50000000
	fmul	d0, d0, d1
	bl	_f_exp
	mov	x8, #13908                      ; =0x3654
	movk	x8, #13268, lsl #16
	movk	x8, #34885, lsl #32
	movk	x8, #16345, lsl #48
	fmov	d1, x8
	fmul	d0, d0, d1
	fmul	d0, d8, d0
	fmov	d1, #1.00000000
	fsub	d0, d1, d0
	ldp	x29, x30, [sp, #16]             ; 16-byte Folded Reload
	ldp	d9, d8, [sp], #32               ; 16-byte Folded Reload
	ret
LBB3_2:
	movi.2d	v1, #0000000000000000
	fsub	d0, d1, d0
	bl	_f0
	fmov	d1, #1.00000000
	fsub	d0, d1, d0
	ldp	x29, x30, [sp, #16]             ; 16-byte Folded Reload
	ldp	d9, d8, [sp], #32               ; 16-byte Folded Reload
	ret
	.cfi_endproc
                                        ; -- End function
	.p2align	2                               ; -- Begin function f_exp
_f_exp:                                 ; @f_exp
	.cfi_startproc
; %bb.0:
	mov	x8, #14831                      ; =0x39ef
	movk	x8, #65274, lsl #16
	movk	x8, #11842, lsl #32
	movk	x8, #16358, lsl #48
	fmov	d1, x8
	fdiv	d1, d0, d1
	frintx	d1, d1
	fcmp	d1, d1
	b.vs	LBB4_7
; %bb.1:
	mov	x8, #4890909195324358656        ; =0x43e0000000000000
	fmov	d2, x8
	fcmp	d1, d2
	b.ge	LBB4_4
; %bb.2:
	mov	x8, #-4332462841530417152       ; =0xc3e0000000000000
	fmov	d2, x8
	fcmp	d1, d2
	b.pl	LBB4_5
; %bb.3:
	mov	x8, #-9223372036854775808       ; =0x8000000000000000
	b	LBB4_6
LBB4_4:
	mov	x8, #9223372036854775807        ; =0x7fffffffffffffff
	b	LBB4_6
LBB4_5:
	fcvtzs	x8, d1
LBB4_6:
	scvtf	d1, x8
	mov	x9, #14831                      ; =0x39ef
	movk	x9, #65274, lsl #16
	movk	x9, #11842, lsl #32
	movk	x9, #49126, lsl #48
	fmov	d2, x9
	fmul	d1, d1, d2
	fadd	d0, d0, d1
	fmov	d1, #1.00000000
	fadd	d1, d0, d1
	fmul	d2, d0, d0
	fmov	d3, #0.50000000
	fmul	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #3.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #0.25000000
	fmul	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #5.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #6.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #7.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #0.12500000
	fmul	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #9.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #10.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #11.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #12.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #13.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #14.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d2, d0, d2
	fmov	d3, #15.00000000
	fdiv	d2, d2, d3
	fadd	d1, d1, d2
	fmul	d0, d0, d2
	mov	x9, #4589168020290535424        ; =0x3fb0000000000000
	fmov	d2, x9
	fmul	d0, d0, d2
	fadd	d0, d1, d0
	mov	x9, #4607182418800017408        ; =0x3ff0000000000000
	add	x8, x9, x8, lsl #52
	fmov	d1, x8
	fmul	d0, d0, d1
	ret
LBB4_7:
	mov	x8, #0                          ; =0x0
	b	LBB4_6
	.cfi_endproc
                                        ; -- End function
.subsections_via_symbols
