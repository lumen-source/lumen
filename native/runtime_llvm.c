// extracted from emit_fn.lm's emitted runtime; llvm_diff going green against the interpreter is the drift gate
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>

// W6/S1 (LLVM runtime side only - see fix/llvm-stdout-buffering's commit body): fully buffered,
// 64KB, instead of unbuffered. Safe because every abrupt-termination path in this file already
// fflushes before exit()/abort() (see buffered_stdout_test.mjs's header comment for the full
// audit); exit(N) itself is standard-guaranteed to flush regardless of buffering mode. The
// emit_fn.lm-emitted runtime (a different file, its own setvbuf call) is NOT touched by this -
// tracked separately as W6-S1b, scheduled after R5 retires the wasm path.
__attribute__((constructor)) void init_stdout(void) {
  setvbuf(stdout, 0, _IOFBF, 65536);
}

static void pic(int64_t v){uint64_t u; int n; char b[24];
if(v<0){putchar(45);u=0-(uint64_t)v;}else{u=(uint64_t)v;}
if(u==0){putchar(48);putchar(10);return;}
n=0; while(u!=0){b[n]=(char)(48+(int)(u%10));n=n+1;u=u/10;}
while(n!=0){n=n-1;putchar((int)b[n]);} putchar(10);}

static double l2d(int64_t b){double d; memcpy(&d,&b,8); return d;}
static int64_t d2l(double d){int64_t b; memcpy(&b,&d,8); return b;}
static int64_t f2i_sat(double x){if(isnan(x))return 0; if(x>=9223372036854775808.0)return INT64_MAX; if(x< -9223372036854775808.0)return INT64_MIN; return (int64_t)x;}
static double f_exp(double x){return exp(x);}
static double f_ln(double x){return log(x);}
static double f_pow(double x,double y){return pow(x,y);}

#include <arm_neon.h>
static inline float64x2_t neon_exp(float64x2_t x){
  float64x2_t k_f = vrndnq_f64(vmulq_f64(x, vdupq_n_f64(1.44269504088896340736)));
  float64x2_t r = vsubq_f64(x, vmulq_f64(k_f, vdupq_n_f64(6.93147180559945286227e-01)));
  r = vsubq_f64(r, vmulq_f64(k_f, vdupq_n_f64(2.31904681384629955842e-17)));
  float64x2_t s = vdupq_n_f64(2.51100376059637769300e-08);
  s = vfmaq_f64(vdupq_n_f64(2.76326396390410286239e-07), s, r);
  s = vfmaq_f64(vdupq_n_f64(2.75572409185789696473e-06), s, r);
  s = vfmaq_f64(vdupq_n_f64(2.48014854823284938896e-05), s, r);
  s = vfmaq_f64(vdupq_n_f64(1.98412698900471130793e-04), s, r);
  s = vfmaq_f64(vdupq_n_f64(1.38888889523147750563e-03), s, r);
  s = vfmaq_f64(vdupq_n_f64(8.33333333331960114665e-03), s, r);
  s = vfmaq_f64(vdupq_n_f64(4.16666666664880988580e-02), s, r);
  s = vfmaq_f64(vdupq_n_f64(1.66666666666666796193e-01), s, r);
  s = vfmaq_f64(vdupq_n_f64(5.00000000000001887379e-01), s, r);
  s = vfmaq_f64(vdupq_n_f64(1.0), s, r);
  s = vfmaq_f64(vdupq_n_f64(1.0), s, r);
  int64x2_t kb = vshlq_n_s64(vaddq_s64(vcvtq_s64_f64(k_f), vdupq_n_s64(1023)), 52);
  return vmulq_f64(s, vreinterpretq_f64_s64(kb));
}

#define AHEAP_CAP 9072
#define LM_CAP_BYTES 36288
int64_t AHEAP[AHEAP_CAP];
int64_t AHP=0;
int64_t LM_HP=0;

int64_t lm_anew(int64_t n){if(n<0)n=0; if(LM_HP+4+8*n>LM_CAP_BYTES||AHP+1+n>AHEAP_CAP){fflush(stdout); exit(0);} LM_HP+=4+8*n; int64_t h=AHP; AHEAP[h]=n; for(int64_t i=0;i<n;i++)AHEAP[h+1+i]=0; AHP=AHP+1+n; return h;}
int64_t lm_aget(int64_t a,int64_t i){int64_t len=AHEAP[a]; if(i<0||i>=len)return 0; return AHEAP[a+1+i];}
void lm_aset(int64_t a,int64_t i,int64_t x){int64_t len=AHEAP[a]; if(i<0||i>=len)return; AHEAP[a+1+i]=x;}
int64_t lm_alen(int64_t a){return AHEAP[a];}

int64_t lm_alloc_bytes(int64_t num_bytes) {
  int64_t words = (num_bytes + 7) / 8;
  if (LM_HP + num_bytes > LM_CAP_BYTES || AHP + words > AHEAP_CAP) { fflush(stdout); exit(0); }
  LM_HP += num_bytes;
  int64_t h = AHP;
  for (int64_t i = 0; i < words; i++) AHEAP[h + i] = 0;
  AHP += words;
  return (int64_t)&AHEAP[h];
}

int64_t lm_alloc_sum(int64_t tag, int64_t payload) {
  if (LM_HP + 16 > LM_CAP_BYTES || AHP + 2 > AHEAP_CAP) { fflush(stdout); exit(0); }
  LM_HP += 16;
  int64_t h = AHP;
  AHEAP[h] = tag;
  AHEAP[h+1] = payload;
  AHP += 2;
  return (int64_t)&AHEAP[h];
}

int64_t lm_concat(int64_t pa, int64_t pb) {
  int32_t la = *(int32_t*)pa;
  int32_t lb = *(int32_t*)pb;
  int64_t ptr = lm_alloc_bytes(4 + la + lb);
  *(int32_t*)ptr = la + lb;
  memcpy((char*)ptr + 4, (char*)pa + 4, la);
  memcpy((char*)ptr + 4 + la, (char*)pb + 4, lb);
  return ptr;
}

int64_t lm_int2text(int64_t val_s) {
  uint64_t v = (uint64_t)val_s;
  int32_t neg = 0;
  if (val_s < 0) {
    neg = 1;
    v = 0 - v;
  }
  int32_t nd = 1;
  uint64_t tmp = v;
  while (1) {
    tmp = tmp / 10;
    if (tmp == 0) break;
    nd++;
  }
  int32_t len = nd + neg;
  int64_t ptr = lm_alloc_bytes(4 + len);
  *(int32_t*)ptr = len;
  char* w = (char*)ptr + 4 + len;
  uint64_t curr = v;
  while (1) {
    w--;
    *w = (char)(48 + (curr % 10));
    curr = curr / 10;
    if (curr == 0) break;
  }
  if (neg) {
    *((char*)ptr + 4) = '-';
  }
  return ptr;
}

int64_t lm_texteq(int64_t pa, int64_t pb) {
  if (pa == pb) return 1;
  if (!pa || !pb) return 0;
  int32_t la = *(int32_t*)pa;
  int32_t lb = *(int32_t*)pb;
  if (la != lb) return 0;
  return memcmp((char*)pa + 4, (char*)pb + 4, la) == 0 ? 1 : 0;
}

void lm_printtext(int64_t a) {
  if (!a) return;
  int32_t len = *(int32_t*)a;
  fwrite((char*)a + 4, 1, len, stdout);
}

// Dec (D3): exact-decimal runtime helpers for emit_llvm.lm's DMUL(68)/DDIV(69)/D2TEXT(70)
// lowering. Ports seed/lumenc.wat's $dec_mul/$dec_div/$dec2text (the oracle) bit-for-bit, but
// uses the target's native __int128 instead of the WAT's hand-rolled 32-bit-limb multiply +
// bit-by-bit restoring division: the widest product possible here (two Dec magnitudes, each
// <= INT64_MAX) is <= (2^63-1)^2 < 2^126, and the widest DDIV numerator (a magnitude * 1e6) is
// << 2^127, so a single unsigned __int128 multiply/divide is exact and never itself overflows -
// the WAT's separate "$dec_qoverflow" 64-bit-quotient-register flag has no equivalent need here
// (its job is folded into the same final `q > INT64_MAX` check both paths already require).
// DADD(66)/DSUB(67) are cheap enough to stay inline IR (llvm.sadd/ssub.with.overflow.i64) in
// emit_llvm.lm itself; only the 128-bit-product ops and text formatting live here.
//
// Trap idiom: fflush(NULL) + abort(), matching the .ll-emitted trap blocks (fflush(ptr null) +
// call void @abort() + unreachable) byte-for-byte in effect, so a Dec runtime trap and an
// IR-level Dec trap (DADD/DSUB overflow) produce the same signal (SIGABRT, nonzero exit).
static void lm_dec_trap(void) { fflush(NULL); abort(); }

int64_t lm_dec_mul(int64_t a, int64_t b) {
  int32_t neg = 0;
  uint64_t ua, ub;
  if (a < 0) { neg ^= 1; ua = (uint64_t)(-a); } else { ua = (uint64_t)a; }   // a,b never INT64_MIN (D1 invariant)
  if (b < 0) { neg ^= 1; ub = (uint64_t)(-b); } else { ub = (uint64_t)b; }
  unsigned __int128 prod = (unsigned __int128)ua * (unsigned __int128)ub;
  unsigned __int128 q = prod / (unsigned __int128)1000000;
  unsigned __int128 r = prod % (unsigned __int128)1000000;
  unsigned __int128 r2 = r * 2;
  if (r2 > (unsigned __int128)1000000) { q += 1; }                          // round half away from zero on the magnitude...
  else if (r2 == (unsigned __int128)1000000) { if (q & 1) q += 1; }         // ...ties to even (sign applied after, below)
  if (q > (unsigned __int128)INT64_MAX) lm_dec_trap();
  int64_t sq = (int64_t)q;
  return neg ? -sq : sq;
}

int64_t lm_dec_div(int64_t a, int64_t b) {
  if (b == 0) lm_dec_trap();
  int32_t neg = 0;
  uint64_t ua, ub;
  if (a < 0) { neg ^= 1; ua = (uint64_t)(-a); } else { ua = (uint64_t)a; }
  if (b < 0) { neg ^= 1; ub = (uint64_t)(-b); } else { ub = (uint64_t)b; }
  unsigned __int128 numer = (unsigned __int128)ua * (unsigned __int128)1000000;
  unsigned __int128 q = numer / (unsigned __int128)ub;
  unsigned __int128 r = numer % (unsigned __int128)ub;
  unsigned __int128 r2 = r * 2;
  if (r2 > (unsigned __int128)ub) { q += 1; }
  else if (r2 == (unsigned __int128)ub) { if (q & 1) q += 1; }
  if (q > (unsigned __int128)INT64_MAX) lm_dec_trap();
  int64_t sq = (int64_t)q;
  return neg ? -sq : sq;
}

// dec2text: canonical Dec -> Text. Never traps (i64::MIN is unreachable for a valid Dec, so
// negation is always total - same argument as the WAT's own $dec2text comment).
int64_t lm_dec2text(int64_t v) {
  int32_t neg = 0;
  if (v < 0) { neg = 1; v = -v; }
  int64_t ip = v / 1000000;
  int64_t fp = v % 1000000;
  int32_t nd = 1;
  int64_t tmp = ip;
  while (1) {
    tmp = tmp / 10;
    if (tmp == 0) break;
    nd++;
  }
  // trim trailing zero fractional digits, keep at least 1 (so "3.0" not "3")
  int32_t flen = 6;
  int64_t probe = fp;
  while (flen > 1 && probe % 10 == 0) {
    probe = probe / 10;
    flen--;
  }
  int32_t len = neg + nd + 1 + flen;
  int64_t ptr = lm_alloc_bytes(4 + len);
  *(int32_t*)ptr = len;
  char* w = (char*)ptr + 4 + len;
  int64_t pcur = probe;
  for (int32_t i = 0; i < flen; i++) {
    w--;
    *w = (char)(48 + (pcur % 10));
    pcur = pcur / 10;
  }
  w--;
  *w = '.';
  int64_t icur = ip;
  for (int32_t i = 0; i < nd; i++) {
    w--;
    *w = (char)(48 + (icur % 10));
    icur = icur / 10;
  }
  if (neg) {
    *((char*)ptr + 4) = '-';
  }
  return ptr;
}
