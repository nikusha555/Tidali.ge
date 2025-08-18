import express from 'express';
import connection from '../../config/db.conf.js';
import striptags from "striptags";

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [meta] = await connection.query(`
      SELECT m_description, m_keywords 
      FROM home
    `);
    const home = meta[0];

    // Latest 3 services where service_type_id = 1
    const [measurementServicesRaw] = await connection.query(`
      SELECT id, name, content, img_url, created_date 
      FROM services 
      WHERE service_type_id = 1 
      ORDER BY created_date DESC 
      LIMIT 3 
    `);

    // Latest 3 services where service_type_id = 2
    const [architecturalServicesRaw] = await connection.query(`
      SELECT id, name, content, img_url, created_date 
      FROM services 
      WHERE service_type_id = 2 
      ORDER BY created_date DESC 
      LIMIT 3
    `);

    const [aboutUsRows] = await connection.query(`
       SELECT title, img_url, content
       FROM about
    `);
    const aboutUs = aboutUsRows[0];

    // ✅ Add preview (strip tags + substring)
    const measurementServices = measurementServicesRaw.map(s => ({
      ...s,
      preview: striptags(s.content).substring(0, 150) // plain-text preview
    }));

    const architecturalServices = architecturalServicesRaw.map(s => ({
      ...s,
      preview: striptags(s.content).substring(0, 150)
    }));

    res.render('index', {
      measurementServices,
      architecturalServices,
      aboutUs,
      m_description: home.m_description,
      m_keywords: home.m_keywords
    });
  } catch (err) {
    console.error('Error fetching latest services:', err);
    res.status(500).send('Server error');
  }
});

export default router;
