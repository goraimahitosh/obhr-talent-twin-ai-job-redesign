// Tokens: participants get a random bearer token (only its hash is stored).
// Faculty: password set on first visit to /admin.html (stored as a scrypt hash in Netlify Blobs),
// or managed by the optional ADMIN_PASSWORD environment variable, which overrides the stored one.
import crypto from 'node:crypto';
import * as S from './store.mjs';

export const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode() {
  const b = crypto.randomBytes(4); let s = 'TT-';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

const scrypt = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const envPassword = () => process.env.ADMIN_PASSWORD || '';

let authCache = null, authAt = 0;
async function auth() {
  if (authCache && Date.now() - authAt < 60000) return authCache;
  let a = await S.getAuth();
  if (!a) {   // create the token-signing secret once; the password stays unset until faculty sets it
    await S.createAuthIfMissing({ signingSecret: crypto.randomBytes(32).toString('hex'), salt: null, hash: null, createdAt: new Date().toISOString() });
    a = await S.getAuth();
  }
  authCache = a; authAt = Date.now(); return a;
}
async function signingKey() {
  if (process.env.ADMIN_SECRET) return sha256('tt-admin-v2:' + process.env.ADMIN_SECRET);
  return sha256('tt-admin-v2:' + (await auth()).signingSecret + ':' + ((await auth()).hash || envPassword()));
}

export async function adminStatus() {
  if (envPassword()) return { configured: true, envManaged: true };
  const a = await auth(); return { configured: !!a.hash, envManaged: false };
}

export async function setupAdminPassword(pw) {
  if (envPassword()) throw Object.assign(new Error('The faculty password is managed by the ADMIN_PASSWORD environment variable.'), { status: 409 });
  const a = await auth();
  if (a.hash) throw Object.assign(new Error('A faculty password is already set. Sign in instead.'), { status: 409 });
  validatePw(pw);
  const salt = crypto.randomBytes(16).toString('hex');
  const next = Object.assign({}, a, { salt, hash: scrypt(pw, salt), setAt: new Date().toISOString() });
  await S.saveAuth(next); authCache = next; authAt = Date.now();
}

export async function changeAdminPassword(current, pw) {
  if (envPassword()) throw Object.assign(new Error('The password is managed by the ADMIN_PASSWORD environment variable in Netlify. Change it there.'), { status: 409 });
  if (!(await checkAdminPassword(current))) throw Object.assign(new Error('Current password is incorrect.'), { status: 401 });
  validatePw(pw);
  const a = await auth(); const salt = crypto.randomBytes(16).toString('hex');
  const next = Object.assign({}, a, { salt, hash: scrypt(pw, salt), setAt: new Date().toISOString() });
  await S.saveAuth(next); authCache = next; authAt = Date.now();   // changing the password signs out all faculty sessions
}

function validatePw(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw Object.assign(new Error('Use a password of at least 10 characters.'), { status: 400 });
}

const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export async function checkAdminPassword(given) {
  if (envPassword()) return same(sha256(given || ''), sha256(envPassword()));
  const a = await auth();
  if (!a.hash) throw Object.assign(new Error('No faculty password has been set yet. Open /admin.html to create one.'), { status: 409 });
  return same(scrypt(given || '', a.salt), a.hash);
}

export async function issueAdminToken(hours = 12) {
  const exp = Date.now() + hours * 3600 * 1000;
  const payload = 'admin.' + exp;
  return payload + '.' + crypto.createHmac('sha256', await signingKey()).update(payload).digest('base64url');
}

export async function verifyAdminToken(tok) {
  if (!tok || typeof tok !== 'string') return false;
  const parts = tok.split('.');
  if (parts.length !== 3 || parts[0] !== 'admin') return false;
  const exp = Number(parts[1]); if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expect = crypto.createHmac('sha256', await signingKey()).update(parts[0] + '.' + parts[1]).digest('base64url');
  return same(expect, parts[2]);
}

export function bearer(req) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}
