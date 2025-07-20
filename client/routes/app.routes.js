import express from 'express';
import connection from '../../config/db.conf.js'
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [meta] = await connection.query(`
  SELECT m_description, m_keywords 
  FROM home
  `)
const home = meta[0];
    // Latest 3 services where service_type_id = 1
    const [measurementServices] = await connection.query(`
      SELECT name, content, created_date 
      FROM services 
      WHERE service_type_id = 1 
      ORDER BY created_date DESC 
      LIMIT 3 
    `);

    // Latest 3 services where service_type_id = 2
    const [architecturalServices] = await connection.query(`
      SELECT name, content, created_date 
      FROM services 
      WHERE service_type_id = 2 
      ORDER BY created_date DESC 
      LIMIT 3
    `);

    res.render('index', {
      measurementServices,
      architecturalServices,
      m_description: home.m_description,
      m_keywords: home.m_keywords
    });
  } catch (err) {
    console.error('Error fetching latest services:', err);
    res.status(500).send('Server error');
  }
});



export default router;
