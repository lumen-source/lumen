import math


def norm_cdf(x):
    t = 1.0 / (1.0 + 0.2316419 * abs(x))
    poly = t * (
        0.319381530
        + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))
    )
    pdf = math.exp(-x * x / 2.0) / math.sqrt(2.0 * math.pi)
    upper_tail_n = 1.0 - pdf * poly
    if x >= 0:
        return upper_tail_n
    else:
        return 1.0 - upper_tail_n


def bs_call(S, K, r, T, sigma):
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return S * norm_cdf(d1) - K * math.exp(-r * T) * norm_cdf(d2)


cases = [
    (100, 100, 0.05, 1.0, 0.20),
    (100, 110, 0.05, 1.0, 0.20),
    (100, 90, 0.05, 0.5, 0.30),
    (50, 50, 0.02, 2.0, 0.25),
]

for S, K, r, T, sigma in cases:
    price = bs_call(S, K, r, T, sigma)
    print(round(price * 10000))
