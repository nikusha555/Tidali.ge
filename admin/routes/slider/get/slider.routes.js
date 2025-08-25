import express from 'express';
import connection from '../../../../config/db.conf.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/', async (req, res) => {
    try {
        const [results] = await connection.query(`
      SELECT 
      *
      FROM slider
    `);

        res.render('pages/slider/slides', { slides: results });
    } catch (err) {
        console.error('Error fetching admin slider:', err);
        res.status(500).render('pages/slider/slides', { error: 'სერვერის შეცდომა' });
    }
});

export default router;
