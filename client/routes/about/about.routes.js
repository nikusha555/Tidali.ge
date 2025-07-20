import express from 'express';
import connection from '../../../config/db.conf.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const [results] = await connection.query(`
      SELECT title, img_url, mini_title, content, m_description, m_keywords
      FROM about 
      
      `);

        const about = results[0];

        res.render('pages/about/about', {
            about, 
            m_description: about.m_description,
            m_keywords: about.m_keywords
        });
        console.log('about route hit, data fetched');
    } catch (err) {
        console.error('Error fetching about:', err);
        res.status(500).send('Server error');
    }
});

export default router;