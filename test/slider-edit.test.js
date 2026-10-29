// End-to-end test of the admin slider edit flow:
// edit page -> multipart upload -> file on disk -> slider.img_url -> /uploads URL -> homepage.
//
// Runs the real app in-process; only config/db.conf.js is replaced with an
// in-memory `slider` table, so no MySQL database is touched.
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
const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'tidali-slider-'));

// --- in-memory database ------------------------------------------------------

const created = new Date('2025-01-01T00:00:00Z');
const slider = new Map([
    [1, { id: 1, title: 'First slide', img_url: '/uploads/slide-one.jpg', created_date: created }],
    [2, { id: 2, title: 'Second slide', img_url: '/uploads/slide-two.jpg', created_date: created }],
]);
const snapshot = () => structuredClone([...slider.values()]);
let failNextUpdate = false;

const fakeDb = {
    async query(sql, params = []) {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s === 'SELECT 1') return [[{ 1: 1 }]];
        if (s === 'SELECT * FROM slider WHERE id = ?' || s === 'SELECT id, img_url FROM slider WHERE id = ?') {
            const row = slider.get(Number(params[0]));
            return [row ? [{ ...row }] : []];
        }
        const update = s.match(/^UPDATE slider SET title = \? ?(, img_url = \?)? WHERE id = \?$/);
        if (update) {
            if (failNextUpdate) {
                failNextUpdate = false;
                throw Object.assign(new Error('simulated connection loss'), { code: 'PROTOCOL_CONNECTION_LOST' });
            }
            const row = slider.get(Number(params.at(-1)));
            if (!row) return [{ affectedRows: 0 }];
            row.title = params[0];
            if (update[1]) row.img_url = params[1];
            return [{ affectedRows: 1 }];
        }
        // homepage
        if (s === 'SELECT m_description, m_keywords FROM home') return [[{ m_description: 'd', m_keywords: 'k' }]];
        if (s === 'SELECT id, title, img_url FROM slider') {
            return [[...slider.values()].map(({ id, title, img_url }) => ({ id, title, img_url }))];
        }
        if (/^SELECT id, name, content, img_url, created_date FROM services WHERE service_type_id = \d/.test(s)) return [[]];
        if (s === 'SELECT title, img_url, content FROM about') return [[{ title: 'About', img_url: null, content: '<p>About</p>' }]];
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
    Object.assign(process.env, {
        NODE_ENV: 'production', PORT: String(port), JWT_SECRET: SECRET, UPLOADS_DIR: UPLOADS,
    });
    for (const name of ['slide-one.jpg', 'slide-two.jpg']) fs.writeFileSync(path.join(UPLOADS, name), sampleImage());

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
    // app.js keeps its listener open; end the test process explicitly
    setImmediate(() => process.exit(process.exitCode ?? 0));
});

// --- helpers -----------------------------------------------------------------

function sampleImage() {
    const dir = path.join(ROOT, 'public', 'uploads');
    return fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /\.jpe?g$/i.test(f))));
}

const authCookie = `admin_token=${jwt.sign({ id: 1, username: 'test' }, SECRET, { expiresIn: '1h' })}`;
const request = (url, opts = {}) => fetch(base + url, { redirect: 'manual', ...opts });

// Opens the edit page like the browser does and returns what the form needs.
const openEditPage = async (id) => {
    const res = await request(`/admin/edit-slides/${id}`, { headers: { cookie: authCookie } });
    assert.equal(res.status, 200);
    const html = await res.text();
    const csrfCookie = res.headers.getSetCookie().find((c) => c.startsWith('admin_csrf=')).split(';')[0];
    return { html, cookie: `${authCookie}; ${csrfCookie}`, token: html.match(/name="_csrf" value="([0-9a-f]+)"/)[1] };
};

// Builds the multipart body a browser sends for the edit form.
// `file: null` mimics "no file chosen": an empty part with filename="".
const submitEdit = async (id, { title, file, cookie, token }) => {
    const fd = new FormData();
    fd.append('_csrf', token);
    if (file === null) {
        fd.append('image', new Blob([], { type: 'application/octet-stream' }), '');
    } else {
        fd.append('image', new Blob([file.bytes], { type: file.type }), file.name);
    }
    if (title !== undefined) fd.append('title', title);
    return request(`/admin/edit-slides/${id}`, { method: 'POST', headers: { cookie, origin }, body: fd });
};

const uploadsNow = () => new Set(fs.readdirSync(UPLOADS));
const homepageImages = async () => {
    const html = await (await request('/')).text();
    return [...html.replace(/\n/g, ' ').matchAll(/<img src="([^"]*)"[^>]*rev-slidebg/g)].map((m) => m[1]);
};

// --- tests -------------------------------------------------------------------

test('edit form posts multipart to the edit route with the field multer expects', async () => {
    const { html } = await openEditPage(2);
    assert.match(html, /<form action="\/admin\/edit-slides\/2" method="POST"\s+enctype="multipart\/form-data">/);
    assert.match(html, /<input name="image" id="imageInput" type="file"\s+accept="image\/jpeg,image\/png,image\/webp,image\/gif"/);
    assert.match(html, /name="title"[\s\S]*?value="Second slide"/);
    assert.match(html, /<img src="\/uploads\/slide-two.jpg"/, 'shows current image');
});

test('uploading a new image updates slider 2 only, serves the file and shows it on the homepage', async () => {
    const before = uploadsNow();
    const other = structuredClone(slider.get(1));
    const { cookie, token } = await openEditPage(2);
    const bytes = sampleImage();

    const res = await submitEdit(2, { title: 'Second slide', file: { bytes, type: 'image/jpeg', name: 'new.jpg' }, cookie, token });
    assert.equal(res.status, 302, logs.slice(-5).join('\n'));
    assert.equal(res.headers.get('location'), '/admin/slider');

    // file exists in the configured (served) uploads directory
    const added = [...uploadsNow()].filter((f) => !before.has(f));
    assert.equal(added.length, 1);
    assert.match(added[0], /^image-\d+-\d+\.jpg$/);
    assert.deepEqual(fs.readFileSync(path.join(UPLOADS, added[0])), bytes);

    // DB points at it, title unchanged, other record untouched
    const newUrl = `/uploads/${added[0]}`;
    assert.equal(slider.get(2).img_url, newUrl);
    assert.equal(slider.get(2).title, 'Second slide');
    assert.deepEqual(slider.get(1), other);

    // public URL works
    const img = await request(newUrl);
    assert.equal(img.status, 200);
    assert.match(img.headers.get('content-type'), /^image\/jpeg/);
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), bytes);

    // homepage shows the new image for slide 2 and keeps slide 1
    assert.deepEqual(await homepageImages(), ['/uploads/slide-one.jpg', newUrl]);

    // the previous image is not deleted
    assert.ok(fs.existsSync(path.join(UPLOADS, 'slide-two.jpg')));

    assert.ok(logs.some((l) => l.includes(`[slider-edit] id=2 updated (affectedRows=1): img_url /uploads/slide-two.jpg -> ${newUrl}`)), logs.join('\n'));
    assert.ok(logs.some((l) => /\[slider-edit\] id=2 received image\/jpeg \d+B -> .*\(on disk: \d+B, served dir: true\)/.test(l)));
});

test('saving without choosing a file keeps the current image and changes only the title', async () => {
    const imageBefore = slider.get(2).img_url;
    const filesBefore = uploadsNow();
    const other = structuredClone(slider.get(1));
    const { cookie, token } = await openEditPage(2);

    const res = await submitEdit(2, { title: 'Renamed slide', file: null, cookie, token });
    assert.equal(res.status, 302, 'an empty file part must not be treated as an upload');
    assert.equal(slider.get(2).img_url, imageBefore);
    assert.equal(slider.get(2).title, 'Renamed slide');
    assert.deepEqual(slider.get(1), other);
    assert.deepEqual(uploadsNow(), filesBefore);
    assert.ok(logs.some((l) => l.includes(`[slider-edit] id=2 updated (affectedRows=1): img_url unchanged (${imageBefore})`)));
    slider.get(2).title = 'Second slide';
});

test('unsupported image type shows a clear message and changes nothing', async () => {
    const dbBefore = snapshot(), filesBefore = uploadsNow();
    const { cookie, token } = await openEditPage(2);
    const res = await submitEdit(2, { title: 'Second slide', file: { bytes: sampleImage(), type: 'image/heic', name: 'photo.heic' }, cookie, token });
    assert.equal(res.status, 400);
    const html = await res.text();
    assert.match(html, /alert alert-danger">ფაილის ეს ფორმატი არ არის მხარდაჭერილი/);
    assert.match(html, /<form action="\/admin\/edit-slides\/2"/, 'renders the edit page again');
    assert.deepEqual(snapshot(), dbBefore);
    assert.deepEqual(uploadsNow(), filesBefore);
});

test('oversized image shows a clear message and leaves no file behind', async () => {
    const dbBefore = snapshot(), filesBefore = uploadsNow();
    const { cookie, token } = await openEditPage(2);
    const res = await submitEdit(2, { title: 'Second slide', file: { bytes: Buffer.alloc(6 * 1024 * 1024), type: 'image/jpeg', name: 'big.jpg' }, cookie, token });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /alert alert-danger">სურათი ძალიან დიდია\. მაქსიმალური ზომაა 5 MB\./);
    assert.deepEqual(snapshot(), dbBefore);
    assert.deepEqual(uploadsNow(), filesBefore);
});

test('missing title is rejected and the new upload is discarded', async () => {
    const dbBefore = snapshot(), filesBefore = uploadsNow();
    const { cookie, token } = await openEditPage(2);
    const res = await submitEdit(2, { title: '   ', file: { bytes: sampleImage(), type: 'image/jpeg', name: 'x.jpg' }, cookie, token });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /სათაური სავალდებულოა/);
    assert.deepEqual(snapshot(), dbBefore);
    assert.deepEqual(uploadsNow(), filesBefore);
});

test('unknown slide id returns 404 and discards the upload', async () => {
    const dbBefore = snapshot(), filesBefore = uploadsNow();
    const { cookie, token } = await openEditPage(2);
    const res = await submitEdit(999, { title: 't', file: { bytes: sampleImage(), type: 'image/jpeg', name: 'x.jpg' }, cookie, token });
    assert.equal(res.status, 404);
    assert.deepEqual(snapshot(), dbBefore);
    assert.deepEqual(uploadsNow(), filesBefore);
});

test('database error returns a safe message and keeps the current image', async () => {
    const dbBefore = snapshot();
    const current = slider.get(2).img_url;
    const { cookie, token } = await openEditPage(2);
    failNextUpdate = true;
    const res = await submitEdit(2, { title: 'Second slide', file: { bytes: sampleImage(), type: 'image/jpeg', name: 'x.jpg' }, cookie, token });
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.equal(text, 'სერვერზე მოხდა შეცდომა');
    assert.deepEqual(snapshot(), dbBefore);
    assert.ok(fs.existsSync(path.join(UPLOADS, path.basename(current))), 'current image file still exists');
    assert.ok(logs.some((l) => l.includes('[slider-edit] id=2 update failed:') && l.includes('simulated connection loss')));
});

test('edit route still requires login and CSRF', async () => {
    const dbBefore = snapshot(), filesBefore = uploadsNow();
    const { token, cookie } = await openEditPage(2);
    const csrfOnly = cookie.split('; ').find((c) => c.startsWith('admin_csrf='));
    const file = { bytes: sampleImage(), type: 'image/jpeg', name: 'x.jpg' };

    const noLogin = await submitEdit(2, { title: 'x', file, cookie: csrfOnly, token });
    assert.equal(noLogin.status, 302);
    assert.equal(noLogin.headers.get('location'), '/admin/login');

    const badToken = await submitEdit(2, { title: 'x', file, cookie, token: 'f'.repeat(64) });
    assert.equal(badToken.status, 403);

    assert.deepEqual(snapshot(), dbBefore);
    assert.deepEqual(uploadsNow(), filesBefore);
});

test('flow logs contain no tokens or cookies', () => {
    const joined = logs.join('\n');
    assert.ok(joined.includes('[slider-edit]'));
    assert.doesNotMatch(joined, /admin_token|admin_csrf|eyJ[A-Za-z0-9_-]{10,}/);
    assert.ok(!joined.includes(SECRET));
});
