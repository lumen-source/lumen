#include <stdio.h>
#include <math.h>
#include <stdint.h>
#include <string.h>
${exp === "f_exp" ? `
static double l2d(int64_t b){double d; memcpy(&d,&b,8); return d;}
static int64_t d2l(double d){int64_t b; memcpy(&b,&d,8); return b;}
static int64_t f2i_sat(double x){if(isnan(x))return 0; if(x>=9223372036854775808.0)return INT64_MAX; if(x< -9223372036854775808.0)return INT64_MIN; return (int64_t)x;}
static double f_exp(double x){int64_t k=f2i_sat(rint(x/0.6931471805599453)); double r=x-(double)k*0.6931471805599453; double sum=1.0,term=1.0; for(int i=1;i<=16;i++){term=term*r/(double)i; sum=sum+term;} return sum*l2d((int64_t)(((uint64_t)(k+1023))<<52));}
static double f_ln(double x){if(x<=0.0)return 0.0; int64_t bits=d2l(x); int64_t e=(int64_t)(((uint64_t)bits>>52)&0x7FF)-1023; double m=l2d((bits&0xFFFFFFFFFFFFFLL)|((int64_t)1023<<52)); if(m>1.4142135623730951){m=m*0.5; e=e+1;} double s=(m-1.0)/(m+1.0),s2=s*s,term=s,sum=s; for(int i=3;i<=31;i+=2){term=term*s2; sum=sum+term/(double)i;} return (double)e*0.6931471805599453+2.0*sum;}
` : ""}
static double norm_cdf(double x){
  if(x<0.0) return 1.0-norm_cdf(-x);
  double k=1.0/(1.0+0.2316419*x);
  double poly=k*(0.319381530+k*(-0.356563782+k*(1.781477937+k*(-1.821255978+k*1.330274429))));
  double pdf=(1.0/sqrt(2.0*3.14159265358979))*f_exp(-(x*x)/2.0);
  return 1.0-pdf*poly;
}
static double bs_call(double s,double k,double r,double t,double vol){
  double d1=(f_ln(s/k)+(r+vol*vol/2.0)*t)/(vol*sqrt(t));
  double d2=d1-vol*sqrt(t);
  return s*norm_cdf(d1)-k*f_exp(-r*t)*norm_cdf(d2);
}
int main(void){
  double acc=0.0;
  for(long i=0;i<2000000;i++){ double vol=0.2+(double)i*0.00000001; acc=acc+bs_call(100.0,100.0,0.05,1.0,vol); }
  printf("%lld\n",(long long)llround(acc*100.0));
  return 0;
}
