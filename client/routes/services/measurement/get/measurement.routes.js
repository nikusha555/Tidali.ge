import express from 'express';
import connection from '../../../../../config/db.conf.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [results] = await connection.query(`
      SELECT name, content, img_url, created_date 
      FROM services 
      WHERE service_type_id = 1
    `);

    res.render('pages/services/measurement', { services: results });
    console.log('Services route hit, data fetched');
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).send('Server error');
  }
});

export default router;
