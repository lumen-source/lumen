# /// script
# dependencies = [
#   "mpmath",
#   "numpy",
# ]
# ///

import numpy as np
from mpmath import mp

mp.dps = 50  # High precision

def chebyshev_nodes(n, a, b):
    # Roots of Chebyshev polynomial of degree n shifted to [a, b]
    nodes = []
    for k in range(1, n + 1):
        x = mp.cos(mp.pi * (2 * k - 1) / (2 * n))
        nodes.append(0.5 * (a + b) + 0.5 * (b - a) * x)
    return nodes

def fit_polynomial(f, degree, a, b):
    # Fit a polynomial to function f on [a, b] using Chebyshev interpolation
    n = degree + 1
    nodes = chebyshev_nodes(n, a, b)
    
    # Solve Vandermonde-like system: V * c = y
    V = []
    y = []
    for x in nodes:
        row = [x**i for i in range(n)]
        V.append(row)
        y.append(f(x))
        
    # Convert to mpmath matrix and solve
    A = mp.matrix(V)
    b_vec = mp.matrix(y)
    coeffs = mp.lu_solve(A, b_vec)
    return [float(c) for c in coeffs]

def test_max_error(f, poly_coeffs, a, b, samples=10000):
    # Sample dense grid to find maximum relative / absolute ULP error
    max_err = 0.0
    for x in np.linspace(float(a), float(b), samples):
        x_mp = mp.mpf(x)
        true_val = f(x_mp)
        
        # Eval polynomial
        poly_val = mp.mpf(0.0)
        for i, c in enumerate(poly_coeffs):
            poly_val += mp.mpf(c) * (x_mp**i)
            
        err = abs(poly_val - true_val)
        if err > max_err:
            max_err = err
    return float(max_err)

def main():
    print("Generating optimal minimax polynomial coefficients...")
    
    # 1. exp(r) on [-0.5 * ln(2), 0.5 * ln(2)]
    ln2_half = 0.5 * mp.log(2)
    a_exp, b_exp = -ln2_half, ln2_half
    
    print(f"Fitting exp(x) on [{float(a_exp)}, {float(b_exp)}]")
    for deg in range(6, 15):
        coeffs_exp = fit_polynomial(mp.exp, deg, a_exp, b_exp)
        err_exp = test_max_error(mp.exp, coeffs_exp, a_exp, b_exp)
        print(f"Degree {deg} exp error: {err_exp:.2e}")
        if err_exp < 1e-16:
            print("Coefficients:")
            for i, c in enumerate(coeffs_exp):
                print(f"  c{i} = {c:.20e}")
            break
        
    # 2. ln_m(s) where s = (m-1)/(m+1), s in [-0.1715728752538099, 0.1715728752538099]
    s_limit = (mp.sqrt(2) - 1.0) / (mp.sqrt(2) + 1.0)
    
    def g_func(s):
        if s == 0.0:
            return mp.mpf(2.0)
        m = (1.0 + s) / (1.0 - s)
        return mp.log(m) / s
        
    print(f"\nFitting ln((1+s)/(1-s))/s on [0, {float(s_limit)}]")
    w_limit = s_limit ** 2
    
    def g_func_w(w):
        s = mp.sqrt(w)
        return g_func(s)
        
    for deg in range(5, 11):
        coeffs_ln_w = fit_polynomial(g_func_w, deg, 0.0, w_limit)
        
        # Test ULP accuracy of reconstructed ln
        max_ln_err = 0.0
        for s_val in np.linspace(0.0, float(s_limit), 10000):
            s_mp = mp.mpf(s_val)
            m_mp = (1.0 + s_mp) / (1.0 - s_mp)
            true_ln = mp.log(m_mp)
            
            # Eval poly in s^2
            w_mp = s_mp ** 2
            poly_val = mp.mpf(0.0)
            for i, c in enumerate(coeffs_ln_w):
                poly_val += mp.mpf(c) * (w_mp**i)
            ln_approx = s_mp * poly_val
            
            err = abs(ln_approx - true_ln)
            if err > max_ln_err:
                max_ln_err = err
                
        print(f"Degree {deg} (s^{2*deg+1} equiv) ln error: {max_ln_err:.2e}")
        if max_ln_err < 1e-16:
            print("Coefficients in w = s^2:")
            for i, c in enumerate(coeffs_ln_w):
                print(f"  c{i} = {c:.20e}")
            break

if __name__ == "__main__":
    main()
