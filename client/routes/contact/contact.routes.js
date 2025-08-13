import express from 'express';
import connection from '../../../config/db.conf.js';

const router = express.Router();


router.get('/', async (req, res) => {
    try {
        const [results] = await connection.query(`
      SELECT title, img_url, email, m_description, m_keywords
      FROM contact 
      
      `);

        const contact = results[0];

        res.render('pages/contact/contact', {
            contact,
            m_description: contact.m_description,
            m_keywords: contact.m_keywords
        });
        console.log('contact route hit, data fetched');
    } catch (err) {
        console.error('Error fetching contact:', err);
        res.status(500).send('Server error');
    }
});





export default router;