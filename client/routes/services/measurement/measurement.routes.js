import express from 'express';
import connection from '../../../../config/db.conf.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const [results] = await connection.query(`
      SELECT id, name, content, img_url, created_date
      FROM services 
      WHERE service_type_id = 1
    `);

        const [meta] = await connection.query(`
            SELECT m_description, m_keywords 
            FROM service_type 
            WHERE id = 2
        `);

        const measurement = meta[0]

        res.render('pages/services/measurement', {
            services: results,
            m_description: measurement.m_description,
            m_keywords: measurement.m_keywords

        });
        console.log('Services route hit, data fetched');
    } catch (err) {
        console.error('Error fetching services:', err);
        res.status(500).send('Server error');
    }
});

export default router;
