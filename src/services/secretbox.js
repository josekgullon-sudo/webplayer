const crypto = require('node:crypto');
const config = require('../config');

// Cifrado autenticado (AES-256-GCM) para todo lo que no debe verse en claro:
// las URLs de origen que viajan al navegador y las credenciales guardadas en
// la base de datos de sesiones. La clave se deriva de SESSION_SECRET.
const KEY = crypto.createHash('sha256').update(config.sessionSecret).digest();
const IV_LEN = 12;
const TAG_LEN = 16;

function seal(plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

function unseal(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  try {
    const buf = Buffer.from(token, 'base64url');
    if (buf.length <= IV_LEN + TAG_LEN) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, IV_LEN));
    decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
    return Buffer.concat([
      decipher.update(buf.subarray(IV_LEN + TAG_LEN)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { seal, unseal };
