// server.js (Client Side)

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import initRoutes from './routes/init.js';

const app = express();

// Simulate __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (CSS, JS, local assets)
app.use(express.static(path.join(__dirname, 'public')));

// Serve shared uploads from main project root
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Parse form data (if needed)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Initialize routes
initRoutes(app);

// Start client server
app.listen(3010, () => {
  console.log('Client is running on http://localhost:3010');
});
