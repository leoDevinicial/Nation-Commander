/** JSON sem perder ±Infinity (usado nos salvamentos): `JSON.stringify(v, encodeNonFinite)`. */
export const encodeNonFinite = (_k: string, v: unknown) => (v === Infinity ? '+Inf' : v === -Infinity ? '-Inf' : v);
export const decodeNonFinite = (_k: string, v: unknown) => (v === '+Inf' ? Infinity : v === '-Inf' ? -Infinity : v);
