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
        services.name AS service_name,
        services.content,
        services.created_date,
        service_type.name AS service_type_name
      FROM services
      JOIN service_type ON services.service_type_id = service_type.id
    `);

        // Use absolute path to the EJS file

        res.render(path.join(__dirname, '../../../views/pages/services/admin-services'), { services: results });
        // postman test
        // res.json({ services: results });

        console.log('Admin services fetched');
    } catch (err) {
        console.error('Error fetching admin services:', err);
        res.status(500).send('Server error');
    }
});

export default router;
