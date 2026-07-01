// Reusable ULP calculation module for float64 comparisons vs mpmath reference
const fbuf = new Float64Array(1);
const ibuf = new BigInt64Array(fbuf.buffer);

export function floatToOrder(f) {
  if (f === 0.0) return 0n;
  if (isNaN(f)) return null;
  fbuf[0] = f;
  const bits = ibuf[0];
  if (bits < 0n) {
    return -(bits & 0x7fffffffffffffffn);
  } else {
    return bits;
  }
}

export function getUlpDiff(actual, expected) {
  if (actual === expected) return 0;
  if (isNaN(actual) || isNaN(expected)) return Infinity;
  const aOrder = floatToOrder(actual);
  const eOrder = floatToOrder(expected);
  if (aOrder === null || eOrder === null) return Infinity;
  const diff = aOrder - eOrder;
  return Math.abs(Number(diff));
}

export function bitsToDouble(hexStr) {
  const bits = BigInt("0x" + hexStr);
  ibuf[0] = bits;
  return fbuf[0];
}
