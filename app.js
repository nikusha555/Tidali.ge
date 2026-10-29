// app.js — single entry point for the public site (/) and admin dashboard (/admin).
//
// Under cPanel / Phusion Passenger, Passenger intercepts listen() and binds the
// app to its own socket, so the port below only matters when running locally.
// Keep this module graph free of top-level await so Passenger can load it with
// either import() or require().

import { isProduction } from './config/env.js';
import express from 'express';
import multer from 'multer';
import createClientApp from './client/app.js';
import createAdminApp, { ADMIN_BASE } from './admin/app.js';
import { UPLOADS_DIR } from './config/uploads.js';
import fs from 'fs';

if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set — admin login will fail until it is configured.');
}

// Startup check: uploads are written to and served from this directory.
try {
    fs.accessSync(UPLOADS_DIR, fs.constants.W_OK);
    console.log(`Uploads directory: ${UPLOADS_DIR} (writable)`);
} catch (err) {
    console.error(`Uploads directory ${UPLOADS_DIR} is not writable (${err.code}) — image uploads will fail.`);
}

const app = express();

app.disable('x-powered-by');

// Basic security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Admin first, so /admin/* never falls through to the public site's 404.
app.use(ADMIN_BASE, createAdminApp());
app.use('/', createClientApp());

// Errors from either app (failed uploads, DB errors in unguarded handlers, ...)
app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    if (err instanceof multer.MulterError) {
        return res.status(400).send(err.message);
    }
    res.status(err.status || 500).send(isProduction ? 'სერვერზე მოხდა შეცდომა' : err.message);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Tidali is running on port ${port} (public: /, admin: ${ADMIN_BASE})`);
});

export default app;
