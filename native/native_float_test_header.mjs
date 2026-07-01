export const C_HEADER = `#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
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
#define AHEAP_CAP (1<<20)
static int64_t AHEAP[AHEAP_CAP];
static int64_t AHP=0;
static int64_t lm_anew(int64_t n){if(n<0)n=0; if(AHP+1+n>AHEAP_CAP)exit(1); int64_t h=AHP; AHEAP[h]=n; for(int64_t i=0;i<n;i++)AHEAP[h+1+i]=0; AHP=AHP+1+n; return h;}
static int64_t lm_aget(int64_t a,int64_t i){int64_t len=AHEAP[a]; if(i<0||i>=len)return 0; return AHEAP[a+1+i];}
static void lm_aset(int64_t a,int64_t i,int64_t x){int64_t len=AHEAP[a]; if(i<0||i>=len)return; AHEAP[a+1+i]=x;}
static int64_t lm_alen(int64_t a){return AHEAP[a];}
`;
