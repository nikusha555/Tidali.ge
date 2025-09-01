import express from 'express';
import connection from '../../../config/db.conf.js';

const router = express.Router();

router.get('/:id', async (req, res) => {
    const serviceId = req.params.id
    try {
        // 1) Fetch service details
        const [results] = await connection.query(`
      SELECT id, name, content, img_url, created_date ,  m_description, m_keywords
      FROM services 
       WHERE id = ? 
    `, [serviceId]);

        const serviceDetails = results[0]

        if (results.length === 0) {
            return res.status(404).send('Service not found');
        }

        // 2) Fetch service gallery images
        const [galleryResults] = await connection.query(`
            SELECT id, img_url 
            FROM service_gallery 
            WHERE service_id = ?
        `, [serviceId]);

        res.render('pages/services/service-details', {
            serviceDetails,
            galleryImages: galleryResults,
            m_description: serviceDetails.m_description,
            m_keywords: serviceDetails.m_keywords
        });
        console.log('Services route hit, data fetched');
    } catch (err) {
        console.error('Error fetching services:', err);
        res.status(500).send('Server error');
    }
});

export default router;