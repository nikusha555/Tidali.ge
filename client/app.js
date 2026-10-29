// client/app.js — public website, mounted at "/" by the root app.js

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import initRoutes from './routes/init.js';
import { UPLOADS_DIR } from '../config/uploads.js';

// Simulate __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function createClientApp() {
    const app = express();

    // Set EJS as the view engine
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // Serve static files (CSS, JS, local assets)
    app.use(express.static(path.join(__dirname, 'public')));

    // Serve shared uploads
    app.use('/uploads', express.static(UPLOADS_DIR));

    // Parse form data (if needed)
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // Initialize routes
    initRoutes(app);

    // 404 handler
    app.use((req, res) => {
        res.status(404).send('404 — Page not found');
    });

    return app;
}
