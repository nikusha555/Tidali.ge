// CSRF protection for the admin dashboard (JWT-cookie auth).
//
// Each browser gets a random secret in an httpOnly cookie scoped to the
// dashboard. Pages embed HMAC(secret) as `csrfToken`; every state-changing
// request must send it back as the `_csrf` form field or `X-CSRF-Token` header.
// Unsafe requests are also rejected when the browser reports a cross-site origin.
//
// Multipart bodies are only parsed by multer inside each route, so those routes
// add `verifyCsrfAfterUpload` right after their multer middleware, and
// multipart requests must also carry a same-origin Origin header.
import crypto from 'crypto';
import fs from 'fs/promises';
import { isProduction } from '../../config/env.js';

const COOKIE = 'admin_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Domain-separated from the JWT signing key. Without JWT_SECRET (login is
// broken anyway) tokens are only valid until the process restarts.
const key = process.env.JWT_SECRET
    ? crypto.createHmac('sha256', process.env.JWT_SECRET).update('tidali-admin-csrf').digest()
    : crypto.randomBytes(32);

const tokenFor = (secret) => crypto.createHmac('sha256', key).update(secret).digest('hex');

const isMultipart = (req) => (req.headers['content-type'] || '').startsWith('multipart/form-data');

const tokenMatches = (req) => {
    const secret = req.cookies?.[COOKIE];
    const sent = req.body?._csrf || req.get('x-csrf-token');
    if (!secret || typeof sent !== 'string') return false;
    const expected = Buffer.from(tokenFor(secret));
    const actual = Buffer.from(sent);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

// Browsers send Origin (and Sec-Fetch-Site) on cross-site POSTs; compare its
// host with the Host header, which Apache/Passenger pass through unchanged.
const isCrossSite = (req) => {
    if (req.get('sec-fetch-site') === 'cross-site') return true;
    const origin = req.get('origin');
    if (!origin) return false;
    try {
        return new URL(origin).host !== req.get('host');
    } catch {
        return true; // "null" or malformed origin
    }
};

const reject = (res) => res.status(403).send('მოთხოვნა უარყოფილია (CSRF). განაახლეთ გვერდი და სცადეთ თავიდან.');

// Sets a new secret cookie and token; also used to rotate them on login/logout.
export const issueCsrfSecret = (res) => {
    const secret = crypto.randomBytes(32).toString('hex');
    res.cookie(COOKIE, secret, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        path: res.locals.adminBase,
    });
    res.locals.csrfToken = tokenFor(secret);
};

export const csrfProtection = (req, res, next) => {
    const secret = req.cookies?.[COOKIE];
    if (secret) {
        res.locals.csrfToken = tokenFor(secret);
    } else {
        issueCsrfSecret(res);
    }

    if (SAFE_METHODS.has(req.method)) return next();
    if (isCrossSite(req)) return reject(res);
    if (isMultipart(req)) {
        // The token sits inside the not-yet-parsed body; upload routes check it
        // after multer. Requiring a same-origin Origin header here covers any
        // route that receives multipart without parsing it.
        return req.get('origin') ? next() : reject(res);
    }
    if (!tokenMatches(req)) return reject(res);
    next();
};

const uploadedFiles = (req) => [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()),
];

export const verifyCsrfAfterUpload = async (req, res, next) => {
    if (tokenMatches(req)) return next();
    await Promise.all(uploadedFiles(req).map(f => fs.unlink(f.path).catch(() => {})));
    reject(res);
};
