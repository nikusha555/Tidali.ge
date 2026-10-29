import express from 'express';
import multer from 'multer';
import connection from '../../../../config/db.conf.js';
import { storage } from '../../../../config/uploads.js';
import { verifyCsrfAfterUpload } from '../../../middlewares/csrf.js';

const router = express.Router();


const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const imageFilter = (req, file, cb) => {
    if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (jpeg, png, webp, gif) are allowed'), false);
    }
};

const upload = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// GET - render add service form
router.get('/', (req, res) => {
    res.render('pages/services/add-services');
});

// POST - handle service creation
router.post('/', upload.single('image'), verifyCsrfAfterUpload, async (req, res) => {
    try {
        const { name, content, service_type_id, m_description, m_keywords } = req.body;
        const filename = req.file?.filename;

        if (!name || !content || !service_type_id || !m_description || !m_keywords || !filename) {
            return res.status(400).send('All fields are required including image.');
        }

        // ✅ Build full image URL (for production, change localhost to your domain)
        const image = `/uploads/${filename}`;

        // Insert service into database
        const query = `
            INSERT INTO services (name, content, service_type_id, img_url, m_description, m_keywords, created_date)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;
        await connection.query(query, [name, content, service_type_id, image, m_description, m_keywords]);

        // Redirect to form with success (or use flash message if you want)
        res.redirect(`${res.locals.adminBase}/services`);

    } catch (err) {
        console.error('❌ Error adding service:', err);
        res.status(500).send('Server error');
    }
});

export default router;
