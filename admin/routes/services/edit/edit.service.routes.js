import express from 'express';
import multer from 'multer';
import path from 'path';
import db from '../../../../config/db.conf.js';

const router = express.Router();

// Set up multer storage for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join('public', 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// GET edit service (with gallery images)
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [[service]] = await db.query('SELECT * FROM services WHERE id = ?', [id]);
        if (!service) return res.status(404).send('Service not found');

        const [gallery] = await db.query('SELECT * FROM service_gallery WHERE service_id = ?', [id]);

        res.render('pages/services/edit-services', { service, gallery });
    } catch (err) {
        console.error('Error fetching service:', err);
        res.status(500).send('Server error');
    }
});

// POST update service + optional gallery upload
router.post('/:id', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'gallery', maxCount: 10 }
]), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, content, service_type_id, m_description, m_keywords } = req.body;

        const mainImage = req.files['image']
            ? `/uploads/${req.files['image'][0].filename}`
            : null;

        // ✅ Update main service data
        let query = `
            UPDATE services 
            SET name = ?, content = ?, service_type_id = ?, m_description = ?, m_keywords = ?
        `;
        const params = [name, content, service_type_id, m_description, m_keywords];

        if (mainImage) {
            query += `, img_url = ?`;
            params.push(mainImage);
        }

        query += ` WHERE id = ?`;
        params.push(id);

        await db.query(query, params);

        // ✅ Insert new gallery images if any
        if (req.files['gallery'] && req.files['gallery'].length > 0) {
            const values = req.files['gallery'].map(file => [id, `/uploads/${file.filename}`]);
            await db.query('INSERT INTO service_gallery (service_id, img_url) VALUES ?', [values]);
        }

        res.redirect(`/services`);
    } catch (err) {
        console.error("Error updating service:", err);
        res.status(500).json({ message: "Error updating service" });
    }
});

// GET gallery delete page
router.get('/:id/gallery-delete', async (req, res) => {
    const { id } = req.params;

    try {
        const [[service]] = await db.query('SELECT * FROM services WHERE id = ?', [id]);
        if (!service) return res.status(404).send('Service not found');

        const [gallery] = await db.query('SELECT * FROM service_gallery WHERE service_id = ?', [id]);

        res.render('pages/services/gallery-delete-form', { service, gallery });
    } catch (err) {
        console.error('Error loading gallery delete page:', err);
        res.status(500).send('Server error');
    }
});

// DELETE gallery image
router.post('/:id/gallery/:imageId/delete', async (req, res) => {
    const { id, imageId } = req.params;

    try {
        const [result] = await db.query(
            'DELETE FROM service_gallery WHERE id = ? AND service_id = ?',
            [imageId, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Image not found' });
        }

        res.redirect(`/edit-services/${id}/gallery-delete`);
    } catch (err) {
        console.error("Error deleting gallery image:", err);
        res.status(500).json({ message: "Error deleting image" });
    }
});



export default router;
