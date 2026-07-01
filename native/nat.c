#include <stdint.h>
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
static double f_exp(double x){int64_t k=f2i_sat(rint(x/0.6931471805599453)); double r=x-(double)k*0.6931471805599453; double sum=1.0,term=1.0; for(int i=1;i<=16;i++){term=term*r/(double)i; sum=sum+term;} return sum*l2d((int64_t)(((uint64_t)(k+1023))<<52));}
static double f_ln(double x){if(x<=0.0)return 0.0; int64_t bits=d2l(x); int64_t e=(int64_t)(((uint64_t)bits>>52)&0x7FF)-1023; double m=l2d((bits&0xFFFFFFFFFFFFFLL)|((int64_t)1023<<52)); if(m>1.4142135623730951){m=m*0.5; e=e+1;} double s=(m-1.0)/(m+1.0),s2=s*s,term=s,sum=s; for(int i=3;i<=31;i+=2){term=term*s2; sum=sum+term/(double)i;} return (double)e*0.6931471805599453+2.0*sum;}
static double f_pow(double x,double y){return f_exp(y*f_ln(x));}
#define AHEAP_CAP (1<<20)
static int64_t AHEAP[AHEAP_CAP];
static int64_t AHP=0;
static int64_t lm_anew(int64_t n){if(n<0)n=0; if(AHP+1+n>AHEAP_CAP)exit(1); int64_t h=AHP; AHEAP[h]=n; for(int64_t i=0;i<n;i++)AHEAP[h+1+i]=0; AHP=AHP+1+n; return h;}
static int64_t lm_aget(int64_t a,int64_t i){int64_t len=AHEAP[a]; if(i<0||i>=len)return 0; return AHEAP[a+1+i];}
static void lm_aset(int64_t a,int64_t i,int64_t x){int64_t len=AHEAP[a]; if(i<0||i>=len)return; AHEAP[a+1+i]=x;}
static int64_t lm_alen(int64_t a){return AHEAP[a];}
__attribute__((always_inline)) static double f0(double p0);
__attribute__((always_inline)) static double f133(double p0,double p1,double p2,double p3,double p4);
__attribute__((always_inline)) static int64_t f219(void);
int main(void){setvbuf(stdout,0,_IONBF,0);f219();return 0;}
static double f0(double p0){
int64_t s0=0,s1=0,s2=0,s3=0,s4=0,s5=0,s6=0,s7=0,s8=0,s9=0;
double sd0=0.0,sd1=0.0,sd2=0.0,sd3=0.0,sd4=0.0,sd5=0.0,sd6=0.0,sd7=0.0,sd8=0.0,sd9=0.0;
double F0=0.0;
double F1=0.0;
double F2=0.0;
double F3=0.0;
F0=p0;
L2: sd0=F0;
L4: sd1=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)0<<32)));
L7: s0=(sd0<sd1)?1:0;
L8: if(s0==0)goto L24;
L10: sd0=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1072693248<<32)));
L13: s1=0;
L15: sd2=F0;
L17: sd1=(double)s1;
L18: sd1=sd1-sd2;
L19: sd1=f0(sd1);
L22: sd0=sd0-sd1;
L23: return sd0;
L24: sd0=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1072693248<<32)));
L27: sd1=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1072693248<<32)));
L30: sd2=l2d((int64_t)(((uint64_t)(uint32_t)410062862)|((uint64_t)(uint32_t)1070442097<<32)));
L33: sd3=F0;
L35: sd2=sd2*sd3;
L36: sd1=sd1+sd2;
L37: sd0=sd0/sd1;
L38: F1=sd0;
L40: sd0=F1;
L42: sd1=l2d((int64_t)(((uint64_t)(uint32_t)982710508)|((uint64_t)(uint32_t)1070887103<<32)));
L45: sd2=F1;
L47: s3=0;
L49: sd4=l2d((int64_t)(((uint64_t)(uint32_t)-441961893)|((uint64_t)(uint32_t)1071043056<<32)));
L52: sd3=(double)s3;
L53: sd3=sd3-sd4;
L54: sd4=F1;
L56: sd5=l2d((int64_t)(((uint64_t)(uint32_t)39804520)|((uint64_t)(uint32_t)1073512687<<32)));
L59: sd6=F1;
L61: s7=0;
L63: sd8=l2d((int64_t)(((uint64_t)(uint32_t)1324513488)|((uint64_t)(uint32_t)1073554397<<32)));
L66: sd7=(double)s7;
L67: sd7=sd7-sd8;
L68: sd8=F1;
L70: sd9=l2d((int64_t)(((uint64_t)(uint32_t)-688641725)|((uint64_t)(uint32_t)1073039565<<32)));
L73: sd8=sd8*sd9;
L74: sd7=sd7+sd8;
L75: sd6=sd6*sd7;
L76: sd5=sd5+sd6;
L77: sd4=sd4*sd5;
L78: sd3=sd3+sd4;
L79: sd2=sd2*sd3;
L80: sd1=sd1+sd2;
L81: sd0=sd0*sd1;
L82: F2=sd0;
L84: sd0=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1072693248<<32)));
L87: sd1=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1073741824<<32)));
L90: sd2=l2d((int64_t)(((uint64_t)(uint32_t)1413754129)|((uint64_t)(uint32_t)1074340347<<32)));
L93: sd1=sd1*sd2;
L94: sd1=sqrt(sd1);
L95: sd0=sd0/sd1;
L96: s1=0;
L98: sd2=F0;
L100: sd3=F0;
L102: sd2=sd2*sd3;
L103: sd1=(double)s1;
L104: sd1=sd1-sd2;
L105: sd2=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1073741824<<32)));
L108: sd1=sd1/sd2;
L109: sd1=f_exp(sd1);
L110: sd0=sd0*sd1;
L111: F3=sd0;
L113: sd0=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1072693248<<32)));
L116: sd1=F3;
L118: sd2=F2;
L120: sd1=sd1*sd2;
L121: sd0=sd0-sd1;
L122: return sd0;
L130: s0=0;
L132: return l2d(s0);
return 0;}
static double f133(double p0,double p1,double p2,double p3,double p4){
int64_t s0=0,s1=0,s2=0,s3=0;
double sd0=0.0,sd1=0.0,sd2=0.0,sd3=0.0;
double F0=0.0;
double F1=0.0;
double F2=0.0;
double F3=0.0;
double F4=0.0;
double F5=0.0;
double F6=0.0;
F0=p0;
F1=p1;
F2=p2;
F3=p3;
F4=p4;
L135: sd0=F0;
L137: sd1=F1;
L139: sd0=sd0/sd1;
L140: sd0=f_ln(sd0);
L141: sd1=F2;
L143: sd2=F4;
L145: sd3=F4;
L147: sd2=sd2*sd3;
L148: sd3=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1073741824<<32)));
L151: sd2=sd2/sd3;
L152: sd1=sd1+sd2;
L153: sd2=F3;
L155: sd1=sd1*sd2;
L156: sd0=sd0+sd1;
L157: sd1=F4;
L159: sd2=F3;
L161: sd2=sqrt(sd2);
L162: sd1=sd1*sd2;
L163: sd0=sd0/sd1;
L164: F5=sd0;
L166: sd0=F5;
L168: sd1=F4;
L170: sd2=F3;
L172: sd2=sqrt(sd2);
L173: sd1=sd1*sd2;
L174: sd0=sd0-sd1;
L175: F6=sd0;
L177: sd0=F0;
L179: sd1=F5;
L181: sd1=f0(sd1);
L184: sd0=sd0*sd1;
L185: sd1=F1;
L187: s2=0;
L189: sd3=F2;
L191: sd2=(double)s2;
L192: sd2=sd2-sd3;
L193: sd3=F3;
L195: sd2=sd2*sd3;
L196: sd2=f_exp(sd2);
L197: sd1=sd1*sd2;
L198: sd2=F6;
L200: sd2=f0(sd2);
L203: sd1=sd1*sd2;
L204: sd0=sd0-sd1;
L205: return sd0;
L216: s0=0;
L218: return l2d(s0);
return 0;}
static int64_t f219(void){
int64_t s0=0,s1=0,s2=0,s3=0,s4=0,s5=0;
double sd0=0.0,sd1=0.0,sd2=0.0,sd3=0.0,sd4=0.0,sd5=0.0;
int64_t F0=0;
double F1=0.0;
int64_t F2=0;
double F3=0.0;
L221: sd0=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)0<<32)));
L224: F1=sd0;
L226: s0=0;
L228: F2=s0;
L230: s0=F2;
L232: s1=2000000;
L234: s0=(s0<s1)?1:0;
L235: if(s0==0)goto L281;
L237: sd0=l2d((int64_t)(((uint64_t)(uint32_t)-1717986918)|((uint64_t)(uint32_t)1070176665<<32)));
L240: s1=F2;
L242: sd1=(double)s1;
L243: sd2=l2d((int64_t)(((uint64_t)(uint32_t)-500134854)|((uint64_t)(uint32_t)1044740494<<32)));
L246: sd1=sd1*sd2;
L247: sd0=sd0+sd1;
L248: F3=sd0;
L250: sd0=F1;
L252: sd1=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1079574528<<32)));
L255: sd2=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1079574528<<32)));
L258: sd3=l2d((int64_t)(((uint64_t)(uint32_t)-1717986918)|((uint64_t)(uint32_t)1068079513<<32)));
L261: sd4=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1072693248<<32)));
L264: sd5=F3;
L266: sd1=f133(sd1,sd2,sd3,sd4,sd5);
L269: sd0=sd0+sd1;
L270: F1=sd0;
L272: s0=F2;
L274: s1=1;
L276: s0=s0+s1;
L277: F2=s0;
L279: goto L230;
L281: sd0=F1;
L283: sd1=l2d((int64_t)(((uint64_t)(uint32_t)0)|((uint64_t)(uint32_t)1079574528<<32)));
L286: sd0=sd0*sd1;
L287: s0=f2i_sat(floor(sd0+0.5));
L288: pic(s0);
L296: exit(0);
return 0;}
