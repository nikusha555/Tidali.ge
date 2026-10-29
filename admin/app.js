// admin/app.js — admin dashboard, mounted at ADMIN_BASE by the root app.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import initAdminRoutes from './routes/init.js';
import cookieParser from 'cookie-parser';
import methodOverride from 'method-override';
import setAdminLocals from './middlewares/admin.safety.js';
import { csrfProtection } from './middlewares/csrf.js';

// Handle ES module __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// URL prefix of the dashboard. Routes, redirects and templates build their
// URLs from res.locals.adminBase, so this is the only place it is defined.
export const ADMIN_BASE = '/admin';

export default function createAdminApp() {
    const app = express();

    // Set EJS as view engine
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    app.use((req, res, next) => {
        res.locals.adminBase = ADMIN_BASE;
        next();
    });

    // Static files served from admin/public at /admin/...
    // redirect: false so "/admin" goes straight to the login redirect below
    // instead of first bouncing to "/admin/".
    app.use(express.static(path.join(__dirname, 'public'), { redirect: false }));
    // Parse form data
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json()); // handles JSON body
    app.use(cookieParser()); // to read cookies
    app.use(setAdminLocals);
    app.use(methodOverride('_method'));
    app.use(csrfProtection);

    // Init admin routes
    initAdminRoutes(app);

    // 404 handler
    app.use((req, res) => {
        res.status(404).send('404 — Page not found');
    });

    return app;
}
