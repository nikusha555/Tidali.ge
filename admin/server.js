// admin/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import initAdminRoutes from './routes/init.js';

const app = express();

// Handle ES module __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files served from admin/public
app.use(express.static(path.join(__dirname, 'public')));

// Serve shared uploads from main project root
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Parse form data
app.use(express.urlencoded({ extended: true }));

// Init admin routes
initAdminRoutes(app);

// Start server on a different port (e.g., 3001)
app.listen(3001, () => {
    console.log('Admin server is running on http://localhost:3001');
});
