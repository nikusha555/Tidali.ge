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
      
        services.id,
        services.name AS service_name,
        services.content,
        services.img_url,
        services.created_date,
        service_type.name AS service_type_name
      FROM services
      JOIN service_type ON services.service_type_id = service_type.id
    `);

    res.render('pages/services/services', { services: results });
  } catch (err) {
    console.error('Error fetching admin services:', err);
    res.status(500).render('pages/services/services', { error: 'სერვერის შეცდომა' });
  }
});

export default router;
