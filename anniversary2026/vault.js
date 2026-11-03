// Open the sealed orbit in the browser.
// package_site.py builds the hash and the ciphertext. This file only checks
// that hash and decrypts.

const ITERATIONS = 250000;
const HASH_LABEL = 'anniversary-hash-v1';

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function deriveBits(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return new Uint8Array(bits);
}

async function signHash(keyBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(HASH_LABEL),
  );
  return new Uint8Array(signature);
}

/** Check the password against the stored hash, then decrypt. Returns the still-compressed bytes. */
export async function openVault(password, buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 68 || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'ANV1') {
    throw new Error('The sealed story is not a vault.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const iterations = view.getUint32(4);
  const salt = bytes.slice(8, 24);
  const expected = bytes.slice(24, 56);
  const iv = bytes.slice(56, 68);
  const cipher = bytes.slice(68);
  const keyBytes = await deriveBits(password, salt, iterations);
  try {
    const actual = await signHash(keyBytes);
    if (!equalBytes(actual, expected)) throw new Error('The password does not match.');
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new Uint8Array(plain);
  } finally {
    keyBytes.fill(0);
  }
}
