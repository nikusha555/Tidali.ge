// HTTP tests for the combined app (run with `npm test`).
//
// Starts the real app.js in production mode with a temporary UPLOADS_DIR and
// deliberately invalid DB credentials, so nothing here can touch real data.
// Routes that need the database are expected to fail with a safe 500.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-secret-not-for-production';
const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'tidali-uploads-'));

let base, host, server, log = '';

const freePort = () => new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
        const { port } = s.address();
        s.close(() => resolve(port));
    });
});

before(async () => {
    const port = await freePort();
    host = `127.0.0.1:${port}`;
    base = `http://${host}`;
    server = spawn(process.execPath, ['app.js'], {
        cwd: ROOT,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: String(port),
            JWT_SECRET: SECRET,
            JWT_EXPIRES_IN: '1h',
            DB_HOST: '127.0.0.1',
            DB_USER: 'tidali_test_no_such_user',
            DB_PASSWORD: 'invalid',
            DB_NAME: 'tidali_test_no_such_db',
            UPLOADS_DIR: UPLOADS,
        },
    });
    server.stdout.on('data', (d) => { log += d; });
    server.stderr.on('data', (d) => { log += d; });
    for (let i = 0; i < 600 && !log.includes('running on port'); i++) {
        await new Promise((r) => setTimeout(r, 100));
    }
    assert.match(log, /running on port/, `server did not start:\n${log}`);
});

after(() => {
    server?.kill();
    fs.rmSync(UPLOADS, { recursive: true, force: true });
});

// --- helpers -----------------------------------------------------------------

const request = (url, { method = 'GET', headers = {}, body } = {}) =>
    fetch(base + url, { method, headers, body, redirect: 'manual' });

const setCookies = (res) => res.headers.getSetCookie();
const cookieValue = (res, name) => {
    const c = setCookies(res).find((s) => s.startsWith(`${name}=`));
    return c && c.slice(name.length + 1).split(';')[0];
};

const adminToken = (payload = { id: 1, username: 'test' }, opts = { expiresIn: '1h' }) =>
    jwt.sign(payload, SECRET, opts);

// Fetches a page to obtain a CSRF cookie + matching token, like a browser would.
const csrfSession = async (authToken = adminToken()) => {
    const res = await request('/admin/login');
    const html = await res.text();
    const secret = cookieValue(res, 'admin_csrf');
    const token = html.match(/name="_csrf" value="([0-9a-f]+)"/)?.[1];
    assert.ok(secret && token, 'login page should issue a CSRF cookie and token');
    const cookie = [`admin_csrf=${secret}`, authToken && `admin_token=${authToken}`].filter(Boolean).join('; ');
    return { cookie, token };
};

const form = (fields) => new URLSearchParams(fields).toString();
const formHeaders = (cookie, extra = {}) => ({ 'content-type': 'application/x-www-form-urlencoded', cookie, ...extra });

const sampleImage = () => {
    const dir = path.join(ROOT, 'public', 'uploads');
    return fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /\.jpe?g$/i.test(f))));
};

const multipart = (fields, fileField, bytes = sampleImage()) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    if (fileField) fd.append(fileField, new Blob([bytes], { type: 'image/jpeg' }), 'test.jpg');
    return fd;
};

const uploadsNow = () => fs.readdirSync(UPLOADS);

// --- routing, static files, exposure ----------------------------------------

test('public site and admin are both served by one process', async () => {
    assert.equal((await request('/css/style.css')).status, 200);
    assert.equal((await request('/admin/css/app.min.css')).status, 200);
    assert.equal((await request('/admin/login')).status, 200);
});

test('admin entry points redirect to /admin/login without a double prefix', async () => {
    for (const url of ['/admin', '/admin/']) {
        const res = await request(url);
        assert.equal(res.status, 302, url);
        assert.equal(res.headers.get('location'), '/admin/login', url);
    }
    assert.equal((await request('/admin/admin/login')).status, 404);
    assert.equal((await request('/edit-about')).status, 404, 'old unprefixed admin URL must not exist');
    assert.equal((await request('/admin/nope')).status, 404);
});

test('source, config and dotfiles are not exposed', async () => {
    for (const url of ['/.env', '/app.js', '/config/db.conf.js', '/package.json', '/admin/app.js', '/admin/.env']) {
        assert.equal((await request(url)).status, 404, url);
    }
});

test('uploads are served from UPLOADS_DIR', async () => {
    fs.writeFileSync(path.join(UPLOADS, 'served.jpg'), sampleImage());
    assert.equal((await request('/uploads/served.jpg')).status, 200);
});

// --- authentication ----------------------------------------------------------

const PROTECTED_GET = ['/admin/services', '/admin/slider', '/admin/edit-about', '/admin/edit-contact',
    '/admin/add-services', '/admin/add-slides', '/admin/edit-services/1', '/admin/edit-slides/1',
    '/admin/edit-services/1/gallery-delete', '/admin/change-password'];

test('protected pages redirect to login without a valid token', async () => {
    const bad = {
        none: undefined,
        wrongSecret: jwt.sign({ id: 1 }, 'wrong-secret'),
        expired: adminToken({ id: 1 }, { expiresIn: -10 }),
        algNone: jwt.sign({ id: 1 }, null, { algorithm: 'none' }),
    };
    for (const [label, token] of Object.entries(bad)) {
        for (const url of PROTECTED_GET) {
            const res = await request(url, { headers: token ? { cookie: `admin_token=${token}` } : {} });
            assert.equal(res.status, 302, `${label} ${url}`);
            assert.equal(res.headers.get('location'), '/admin/login', `${label} ${url}`);
        }
    }
});

test('protected POSTs with a valid CSRF token still require login', async () => {
    const { cookie, token } = await csrfSession(null);
    for (const url of ['/admin/delete-services/1', '/admin/delete-slides/1', '/admin/change-password',
        '/admin/edit-services/1/gallery/1/delete', '/admin/edit-about/media/delete-image']) {
        const res = await request(url, { method: 'POST', headers: formHeaders(cookie), body: form({ _csrf: token }) });
        assert.equal(res.status, 302, url);
        assert.equal(res.headers.get('location'), '/admin/login', url);
    }
});

// --- cookies -----------------------------------------------------------------

test('CSRF cookie is httpOnly, Secure in production, SameSite=Strict and scoped to /admin', async () => {
    const c = setCookies(await request('/admin/login')).find((s) => s.startsWith('admin_csrf='));
    assert.ok(c);
    assert.match(c, /; Path=\/admin(;|$)/);
    assert.match(c, /; HttpOnly/);
    assert.match(c, /; Secure/);
    assert.match(c, /; SameSite=Strict/);
});

test('public pages do not set admin cookies', async () => {
    assert.deepEqual(setCookies(await request('/css/style.css')), []);
});

// --- CSRF --------------------------------------------------------------------

test('login POST requires a CSRF token', async () => {
    const { cookie, token } = await csrfSession(null);
    const body = form({ username: 'x', password: 'y' });
    assert.equal((await request('/admin/login', { method: 'POST', headers: formHeaders(cookie), body })).status, 403);
    assert.equal((await request('/admin/login', { method: 'POST', headers: formHeaders(''), body: form({ username: 'x', password: 'y', _csrf: token }) })).status, 403,
        'token without its cookie');
    assert.equal((await request('/admin/login', { method: 'POST', headers: formHeaders(cookie), body: form({ username: 'x', password: 'y', _csrf: 'a'.repeat(64) }) })).status, 403,
        'wrong token');
    // valid token passes CSRF and reaches the DB lookup, which fails safely here
    const res = await request('/admin/login', { method: 'POST', headers: formHeaders(cookie), body: form({ username: 'x', password: 'y', _csrf: token }) });
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.doesNotMatch(text, /Access denied|ER_|at .*\.js/, 'production error must not leak details');
});

test('cross-site requests are rejected even with a valid token', async () => {
    const { cookie, token } = await csrfSession();
    for (const extra of [{ origin: 'https://evil.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
        const res = await request('/admin/delete-services/1', { method: 'POST', headers: formHeaders(cookie, extra), body: form({ _csrf: token }) });
        assert.equal(res.status, 403, JSON.stringify(extra));
    }
});

test('same-origin request with a valid token passes CSRF', async () => {
    const { cookie, token } = await csrfSession();
    const res = await request('/admin/delete-services/1', {
        method: 'POST', headers: formHeaders(cookie, { origin: `http://${host}`, 'sec-fetch-site': 'same-origin' }), body: form({ _csrf: token }),
    });
    assert.equal(res.status, 500, 'reaches the DB delete, which fails without a database');
});

test('fetch-style requests can send the token in X-CSRF-Token', async () => {
    const { cookie, token } = await csrfSession();
    const url = '/admin/edit-contact/media/delete-image';
    assert.equal((await request(url, { method: 'POST', headers: { cookie } })).status, 403);
    assert.equal((await request(url, { method: 'POST', headers: { cookie, 'x-csrf-token': token } })).status, 500);
});

test('method override cannot bypass CSRF', async () => {
    const { cookie } = await csrfSession();
    const res = await request('/admin/delete-services/1?_method=DELETE', { method: 'POST', headers: formHeaders(cookie), body: '' });
    assert.equal(res.status, 403);
});

// --- delete routes -----------------------------------------------------------

test('delete routes no longer act on GET', async () => {
    const cookie = `admin_token=${adminToken()}`;
    for (const url of ['/admin/delete-services/1', '/admin/delete-slides/1']) {
        assert.equal((await request(url, { headers: { cookie } })).status, 404, url);
    }
});

test('delete routes require POST with a CSRF token', async () => {
    const { cookie, token } = await csrfSession();
    for (const url of ['/admin/delete-services/1', '/admin/delete-slides/1', '/admin/edit-services/1/gallery/1/delete']) {
        assert.equal((await request(url, { method: 'POST', headers: formHeaders(cookie), body: '' })).status, 403, url);
        assert.equal((await request(url, { method: 'POST', headers: formHeaders(cookie), body: form({ _csrf: token }) })).status, 500, url);
    }
});

// --- uploads + CSRF ------------------------------------------------------------

const UPLOAD_ROUTES = [
    ['/admin/add-services', 'image'],
    ['/admin/add-slides', 'image'],
    ['/admin/edit-services/1', 'image'],
    ['/admin/edit-slides/1', 'image'],
    ['/admin/edit-about/update', 'image'],
    ['/admin/edit-contact', 'image'],
];

test('every upload route rejects a missing token and deletes the uploaded file', async () => {
    const { cookie } = await csrfSession();
    const before = uploadsNow();
    for (const [url, field] of UPLOAD_ROUTES) {
        const res = await request(url, {
            method: 'POST', headers: { cookie, origin: `http://${host}` }, body: multipart({ title: 't' }, field),
        });
        assert.equal(res.status, 403, url);
    }
    assert.deepEqual(uploadsNow(), before, 'rejected uploads must not stay on disk');
});

test('multipart requests without an Origin header are rejected before parsing', async () => {
    const { cookie, token } = await csrfSession();
    const before = uploadsNow();
    const res = await request('/admin/add-slides', { method: 'POST', headers: { cookie }, body: multipart({ title: 't', _csrf: token }, 'image') });
    assert.equal(res.status, 403);
    // also covers non-upload routes that never parse the multipart body
    const del = await request('/admin/delete-services/1', { method: 'POST', headers: { cookie }, body: multipart({ _csrf: token }) });
    assert.equal(del.status, 403);
    assert.deepEqual(uploadsNow(), before);
});

test('upload with a valid token is stored in UPLOADS_DIR', async () => {
    const { cookie, token } = await csrfSession();
    const before = new Set(uploadsNow());
    const res = await request('/admin/add-slides', {
        method: 'POST', headers: { cookie, origin: `http://${host}` }, body: multipart({ title: 't', _csrf: token }, 'image'),
    });
    assert.equal(res.status, 500, 'DB insert fails without a database');
    const added = uploadsNow().filter((f) => !before.has(f));
    assert.equal(added.length, 1);
    assert.match(added[0], /^image-\d+-\d+\.jpg$/);
});

test('oversized upload is rejected with 400', async () => {
    const { cookie, token } = await csrfSession();
    const res = await request('/admin/add-slides', {
        method: 'POST', headers: { cookie, origin: `http://${host}` },
        body: multipart({ title: 't', _csrf: token }, 'image', Buffer.alloc(6 * 1024 * 1024)),
    });
    assert.equal(res.status, 400);
});

// --- list pages on DB failure --------------------------------------------------

test('service and slide lists render a safe error page when the DB fails', async () => {
    const cookie = `admin_token=${adminToken()}`;
    for (const url of ['/admin/services', '/admin/slider']) {
        const res = await request(url, { headers: { cookie } });
        assert.equal(res.status, 500, url);
        const html = await res.text();
        assert.match(html, /alert alert-danger">სერვერის შეცდომა</, url);
        assert.doesNotMatch(html, /Access denied|ER_ACCESS|ReferenceError/, url);
    }
    assert.doesNotMatch(log, /ReferenceError/, 'no secondary ReferenceError in server log');
});

// --- rendered admin pages ----------------------------------------------------

test('admin forms carry CSRF tokens and /admin-prefixed URLs', async () => {
    const cookie = `admin_token=${adminToken()}`;
    const html = await (await request('/admin/add-services', { headers: { cookie } })).text();
    assert.match(html, /action="\/admin\/add-services"/);
    assert.match(html, /action="\/admin\/logout" method="POST"/);
    assert.equal(html.match(/name="_csrf" value="[0-9a-f]{64}"/g)?.length, 2, 'upload form + logout form');
    assert.doesNotMatch(html, /(href|src|action)="\/(css|js|images|services|slider|edit-|add-|delete-)/,
        'no unprefixed root-absolute admin URLs');
    for (const [, asset] of html.matchAll(/(?:src|href)="(\/admin\/(?:css|js|images)\/[^"]+)"/g)) {
        assert.equal((await request(asset)).status, 200, asset);
    }
});

// --- password change -----------------------------------------------------------

test('password change validates input before touching the database', async () => {
    const { cookie, token } = await csrfSession();
    const post = (fields) => request('/admin/change-password', { method: 'POST', headers: formHeaders(cookie), body: form({ _csrf: token, ...fields }) });

    let res = await post({ oldPassword: 'old', newPassword: 'longenough1', confirmPassword: 'different1' });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /ახალი პაროლები არ ემთხვევა/);

    res = await post({ oldPassword: 'old', newPassword: 'short', confirmPassword: 'short' });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /მინიმუმ 8/);

    res = await post({ oldPassword: '', newPassword: 'longenough1', confirmPassword: 'longenough1' });
    assert.equal(res.status, 400);

    // valid input proceeds to the DB lookup
    res = await post({ oldPassword: 'old', newPassword: 'longenough1', confirmPassword: 'longenough1' });
    assert.equal(res.status, 500);
});

// --- logout --------------------------------------------------------------------

test('logout requires POST + CSRF and clears the admin cookie on both paths', async () => {
    const { cookie, token } = await csrfSession();
    assert.equal((await request('/admin/logout', { headers: { cookie } })).status, 404, 'no GET logout');
    assert.equal((await request('/admin/logout', { method: 'POST', headers: formHeaders(cookie), body: '' })).status, 403);

    const res = await request('/admin/logout', { method: 'POST', headers: formHeaders(cookie), body: form({ _csrf: token }) });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin/login');
    const cleared = setCookies(res).filter((c) => c.startsWith('admin_token=;'));
    assert.equal(cleared.length, 2);
    for (const c of cleared) {
        assert.match(c, /Expires=Thu, 01 Jan 1970/);
        assert.match(c, /HttpOnly/);
        assert.match(c, /Secure/);
    }
    assert.deepEqual(cleared.map((c) => c.match(/Path=([^;]+)/)[1]).sort(), ['/', '/admin']);
    const newSecret = cookieValue(res, 'admin_csrf');
    assert.ok(newSecret && !cookie.includes(newSecret), 'CSRF secret is rotated on logout');
});
