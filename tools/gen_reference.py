# /// script
# dependencies = [
#   "mpmath",
# ]
# ///

import json
import math
from mpmath import mp

# Set precision to 113 bits (binary128 / quadruple precision)
mp.prec = 113

def N_cdf(x):
    x = mp.mpf(x)
    a = mp.fabs(x)
    k = 1.0 / (1.0 + mp.mpf("0.2316419") * a)
    poly = k * (mp.mpf("0.319381530") + k * (mp.mpf("-0.356563782") + k * (mp.mpf("1.781477937") + k * (mp.mpf("-1.821255978") + k * mp.mpf("1.330274429")))))
    pdf = (1.0 / mp.sqrt(2.0 * mp.pi)) * mp.exp(-0.5 * a * a)
    if x < 0:
        return pdf * poly
    else:
        return 1.0 - pdf * poly

def bs_call(s, k, r, t, vol):
    s = mp.mpf(s)
    k = mp.mpf(k)
    r = mp.mpf(r)
    t = mp.mpf(t)
    vol = mp.mpf(vol)
    
    d1 = (mp.log(s / k) + (r + (vol ** 2) / 2.0) * t) / (vol * mp.sqrt(t))
    d2 = d1 - vol * mp.sqrt(t)
    
    price = s * N_cdf(d1) - k * mp.exp(-r * t) * N_cdf(d2)
    return float(price)

def main():
    print("Generating mathematical goldens using 113-bit precision...")
    
    # 1. exp(x) grid
    exp_grid = []
    # x from -10 to 10 with step 0.05
    for i in range(-200, 201):
        x = i * 0.05
        val = float(mp.exp(mp.mpf(x)))
        exp_grid.append({"x": x, "expected": val})
        
    # 2. ln(x) grid
    ln_grid = []
    # x from 0.01 to 100 with varying step
    # small values
    for i in range(1, 100):
        x = i * 0.01
        val = float(mp.log(mp.mpf(x)))
        ln_grid.append({"x": x, "expected": val})
    # standard values
    for i in range(10, 1001):
        x = i * 0.1
        val = float(mp.log(mp.mpf(x)))
        ln_grid.append({"x": x, "expected": val})

    # 3. Black-Scholes corpus inputs (varying vol)
    # Volatility perturbed exactly as in the benchmark
    bs_cases = []
    for i in range(0, 1000):
        vol = 0.2 + i * 0.00000001
        price = bs_call(100.0, 100.0, 0.05, 1.0, vol)
        bs_cases.append({"i": i, "vol": vol, "expected": price})
        
    # Also generate a wider randomized set of option prices (100 cases)
    # to ensure the formula holds under diverse parameters
    bs_robust_cases = []
    params = [
        # (S, K, r, T, vol)
        (100.0, 100.0, 0.05, 1.0, 0.2),
        (100.0, 120.0, 0.05, 1.0, 0.2),
        (100.0, 80.0, 0.05, 1.0, 0.2),
        (100.0, 100.0, 0.01, 1.0, 0.2),
        (100.0, 100.0, 0.10, 1.0, 0.2),
        (100.0, 100.0, 0.05, 0.1, 0.2),
        (100.0, 100.0, 0.05, 5.0, 0.2),
        (100.0, 100.0, 0.05, 1.0, 0.05),
        (100.0, 100.0, 0.05, 1.0, 1.5),
        (10.0, 10.0, 0.05, 1.0, 0.2),
        (500.0, 500.0, 0.05, 1.0, 0.2),
    ]
    # Add a grid of combinations
    for S in [50.0, 100.0, 150.0]:
        for K in [80.0, 100.0, 120.0]:
            for r in [0.02, 0.08]:
                for T in [0.25, 2.0]:
                    for vol in [0.1, 0.4]:
                        params.append((S, K, r, T, vol))
                        
    for idx, (S, K, r, T, vol) in enumerate(params):
        price = bs_call(S, K, r, T, vol)
        bs_robust_cases.append({
            "idx": idx,
            "S": S,
            "K": K,
            "r": r,
            "T": T,
            "vol": vol,
            "expected": price
        })

    reference_data = {
        "exp": exp_grid,
        "ln": ln_grid,
        "bs_vol_perturbed": bs_cases,
        "bs_robust": bs_robust_cases
    }
    
    out_path = "native/float_reference.json"
    with open(out_path, "w") as f:
        json.dump(reference_data, f, indent=2)
        
    print(f"Successfully generated reference data in {out_path}")

if __name__ == "__main__":
    main()
