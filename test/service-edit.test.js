// End-to-end test of the admin service edit flow (POST /admin/edit-services/:id).
//
// Runs the real app in-process; only config/db.conf.js is replaced with in-memory
// `services` / `service_gallery` tables, so no MySQL database is touched.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import jwt from 'jsonwebtoken';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-secret-not-for-production';
const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'tidali-services-'));

// --- in-memory database ------------------------------------------------------

const services = new Map([
    [1, { id: 1, service_type_id: 1, name: 'Survey', content: '<p>old</p>', img_url: '/uploads/s1.jpg', m_description: 'md', m_keywords: 'mk', created_date: new Date() }],
    [2, { id: 2, service_type_id: 2, name: 'Architecture', content: '<p>arch</p>', img_url: '/uploads/s2.jpg', m_description: 'md2', m_keywords: 'mk2', created_date: new Date() }],
]);
const gallery = [{ id: 1, service_id: 1, img_url: '/uploads/g1.jpg' }];
const snapshot = () => structuredClone({ services: [...services.values()], gallery });
let failNextUpdate = false;

const fakeDb = {
    async query(sql, params = []) {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s === 'SELECT 1') return [[{ 1: 1 }]];
        if (s === 'SELECT * FROM services WHERE id = ?') {
            const row = services.get(Number(params[0]));
            return [row ? [{ ...row }] : []];
        }
        if (s === 'SELECT * FROM service_gallery WHERE service_id = ?') {
            return [gallery.filter((g) => g.service_id === Number(params[0])).map((g) => ({ ...g }))];
        }
        const update = s.match(/^UPDATE services SET name = \?, content = \?, service_type_id = \?, m_description = \?, m_keywords = \?( , img_url = \?)? WHERE id = \?$/);
        if (update) {
            if (failNextUpdate) {
                failNextUpdate = false;
                throw Object.assign(new Error('simulated connection loss'), { code: 'PROTOCOL_CONNECTION_LOST' });
            }
            const row = services.get(Number(params.at(-1)));
            if (!row) return [{ affectedRows: 0, changedRows: 0 }];
            const before = JSON.stringify(row);
            const [name, content, typeId, mDesc, mKeys] = params;
            Object.assign(row, { name, content, service_type_id: Number(typeId), m_description: mDesc, m_keywords: mKeys });
            if (update[1]) row.img_url = params[5];
            // like mysql2 with FOUND_ROWS: matched rows vs rows whose values changed
            return [{ affectedRows: 1, changedRows: JSON.stringify(row) === before ? 0 : 1 }];
        }
        if (s === 'SELECT name, service_type_id, img_url, CHAR_LENGTH(content) AS content_length FROM services WHERE id = ?') {
            const row = services.get(Number(params[0]));
            return [row ? [{ name: row.name, service_type_id: row.service_type_id, img_url: row.img_url, content_length: row.content.length }] : []];
        }
        if (s === 'INSERT INTO service_gallery (service_id, img_url) VALUES ?') {
            for (const [serviceId, url] of params[0]) gallery.push({ id: gallery.length + 1, service_id: Number(serviceId), img_url: url });
            return [{ affectedRows: params[0].length }];
        }
        throw new Error(`unexpected SQL in test: ${s}`);
    },
};

// --- server ------------------------------------------------------------------

let base, origin;
const logs = [];
const realLog = console.log, realError = console.error, realWarn = console.warn;

const freePort = () => new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
        const { port } = s.address();
        s.close(() => resolve(port));
    });
});

before(async () => {
    const port = await freePort();
    base = origin = `http://127.0.0.1:${port}`;
    Object.assign(process.env, { NODE_ENV: 'production', PORT: String(port), JWT_SECRET: SECRET, UPLOADS_DIR: UPLOADS });
    mock.module(pathToFileURL(path.join(ROOT, 'config', 'db.conf.js')).href, { defaultExport: fakeDb });
    console.log = console.warn = (...a) => logs.push(a.join(' '));
    console.error = (...a) => logs.push(a.map(String).join(' '));
    await import(pathToFileURL(path.join(ROOT, 'app.js')).href);
    for (let i = 0; i < 300 && !logs.some((l) => l.includes('running on port')); i++) {
        await new Promise((r) => setTimeout(r, 50));
    }
});

after(() => {
    Object.assign(console, { log: realLog, error: realError, warn: realWarn });
    fs.rmSync(UPLOADS, { recursive: true, force: true });
    setImmediate(() => process.exit(process.exitCode ?? 0));
});

// --- helpers -----------------------------------------------------------------

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const authCookie = `admin_token=${jwt.sign({ id: 1, username: 'test' }, SECRET, { expiresIn: '1h' })}`;
const request = (url, opts = {}) => fetch(base + url, { redirect: 'manual', ...opts });
const uploadsNow = () => new Set(fs.readdirSync(UPLOADS));
const serviceLogs = (id) => logs.filter((l) => l.startsWith(`[service-edit] id=${id} `));

const openEditPage = async (id) => {
    const res = await request(`/admin/edit-services/${id}`, { headers: { cookie: authCookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    const csrfCookie = res.headers.getSetCookie().find((c) => c.startsWith('admin_csrf=')).split(';')[0];
    return { html, cookie: `${authCookie}; ${csrfCookie}`, token: html.match(/name="_csrf" value="([0-9a-f]+)"/)[1] };
};

// Sends the same multipart fields the browser sends for the edit form.
// Empty `image`/`gallery` parts mimic "no file chosen".
const submitEdit = async (id, { cookie, token, fields, image = null, galleryFiles = [] }) => {
    const fd = new FormData();
    fd.append('_csrf', token);
    fd.append('image', image ? new Blob([PNG], { type: 'image/png' }) : new Blob([], { type: 'application/octet-stream' }), image ?? '');
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    if (galleryFiles.length === 0) fd.append('gallery', new Blob([], { type: 'application/octet-stream' }), '');
    for (const name of galleryFiles) fd.append('gallery', new Blob([PNG], { type: 'image/png' }), name);
    return request(`/admin/edit-services/${id}`, { method: 'POST', headers: { cookie, origin }, body: fd });
};

const fieldsOf = (row, overrides = {}) => ({
    name: row.name, content: row.content, m_description: row.m_description,
    m_keywords: row.m_keywords, service_type_id: String(row.service_type_id), ...overrides,
});

// --- tests -------------------------------------------------------------------

test('edit form field names match what the route reads', async () => {
    const { html } = await openEditPage(1);
    assert.match(html, /<form action="\/admin\/edit-services\/1" method="POST"\s+enctype="multipart\/form-data">/);
    for (const name of ['_csrf', 'image', 'name', 'content', 'm_description', 'm_keywords', 'service_type_id', 'gallery']) {
        assert.match(html, new RegExp(`name="${name}"`), name);
    }
});

test('editing text fields updates only that service, keeps image and gallery, then redirects', async () => {
    const other = structuredClone(services.get(2));
    const galleryBefore = structuredClone(gallery);
    const { cookie, token } = await openEditPage(1);
    const res = await submitEdit(1, { cookie, token, fields: fieldsOf(services.get(1), {
        name: 'აზომვა', content: '<p>new</p>', service_type_id: '2', m_description: 'nd', m_keywords: 'nk',
    }) });
    assert.equal(res.status, 302, logs.slice(-5).join('\n'));
    assert.equal(res.headers.get('location'), '/admin/services');
    assert.deepEqual(
        { ...services.get(1), created_date: undefined },
        { id: 1, service_type_id: 2, name: 'აზომვა', content: '<p>new</p>', img_url: '/uploads/s1.jpg', m_description: 'nd', m_keywords: 'nk', created_date: undefined },
    );
    assert.deepEqual(services.get(2), other);
    assert.deepEqual(gallery, galleryBefore);

    const lines = serviceLogs(1);
    assert.ok(lines.includes('[service-edit] id=1 fields: name="აზომვა" content_length=10 service_type_id="2" m_description_length=2 m_keywords="nk"'), lines.join('\n'));
    assert.ok(lines.includes('[service-edit] id=1 files: none'));
    assert.ok(lines.includes('[service-edit] id=1 UPDATE affectedRows=1 changedRows=1'));
    assert.ok(lines.includes('[service-edit] id=1 stored: name="აზომვა" service_type_id=2 img_url=/uploads/s1.jpg content_length=10'));
    assert.ok(!logs.some((l) => l.includes(token)), 'CSRF token must not be logged');
});

test('saving unchanged values is a success (changedRows=0), not a failure', async () => {
    const { cookie, token } = await openEditPage(2);
    const res = await submitEdit(2, { cookie, token, fields: fieldsOf(services.get(2)) });
    assert.equal(res.status, 302);
    assert.ok(serviceLogs(2).includes('[service-edit] id=2 UPDATE affectedRows=1 changedRows=0'));
});

test('new main image and gallery images are stored; existing gallery is kept', async () => {
    const before = uploadsNow();
    const { cookie, token } = await openEditPage(1);
    const res = await submitEdit(1, { cookie, token, fields: fieldsOf(services.get(1)), image: 'main.png', galleryFiles: ['a.png', 'b.png'] });
    assert.equal(res.status, 302, logs.slice(-5).join('\n'));
    const added = [...uploadsNow()].filter((f) => !before.has(f));
    assert.equal(added.length, 3);
    assert.match(services.get(1).img_url, /^\/uploads\/image-\d+-\d+\.png$/);
    const g = gallery.filter((x) => x.service_id === 1).map((x) => x.img_url);
    assert.equal(g[0], '/uploads/g1.jpg');
    assert.equal(g.length, 3);
    assert.ok(serviceLogs(1).some((l) => /files: image:"main\.png" image\/png \d+B -> image-.*gallery:"a\.png"/.test(l)));
    assert.ok(serviceLogs(1).includes('[service-edit] id=1 gallery: inserted 2 image(s)'));
});

test('unknown service id is reported as 404, not a silent redirect', async () => {
    const before = uploadsNow();
    const { cookie, token } = await openEditPage(1);
    const res = await submitEdit(999, { cookie, token, fields: fieldsOf(services.get(1)), image: 'x.png' });
    assert.equal(res.status, 404);
    assert.deepEqual(uploadsNow(), before, 'the rejected upload is removed');
    assert.ok(serviceLogs(999).includes('[service-edit] id=999 UPDATE matched no row: service does not exist'));
});

test('missing required field is rejected and the database is unchanged', async () => {
    const dbBefore = snapshot();
    const { cookie, token } = await openEditPage(1);
    const { name, ...rest } = fieldsOf(services.get(1));
    const res = await submitEdit(1, { cookie, token, fields: rest });
    assert.equal(res.status, 400);
    assert.deepEqual(snapshot(), dbBefore);
});

test('database error returns 500 and logs the stack trace', async () => {
    const dbBefore = snapshot();
    const { cookie, token } = await openEditPage(1);
    failNextUpdate = true;
    const res = await submitEdit(1, { cookie, token, fields: fieldsOf(services.get(1), { name: 'nope' }) });
    assert.equal(res.status, 500);
    assert.deepEqual(snapshot(), dbBefore);
    assert.ok(logs.some((l) => l.startsWith('[service-edit] id=1 error updating service: Error: simulated connection loss\n    at ')));
});

test('invalid CSRF token is still rejected before any update', async () => {
    const dbBefore = snapshot();
    const { cookie } = await openEditPage(1);
    const res = await submitEdit(1, { cookie, token: '0'.repeat(64), fields: fieldsOf(services.get(1), { name: 'nope' }) });
    assert.equal(res.status, 403);
    assert.deepEqual(snapshot(), dbBefore);
});
