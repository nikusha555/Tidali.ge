import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import connection from '../../../../config/db.conf.js';

const router = express.Router();

// Define uploads folder and ensure it exists
const uploadPath = path.resolve('public', 'uploads');
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}

// Set up Multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage });

// GET - render add service form
router.get('/', (req, res) => {
    res.render('pages/services/add-services');
});

// POST - handle service creation
router.post('/', upload.single('image'), async (req, res) => {
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
        res.redirect('/services');

    } catch (err) {
        console.error('❌ Error adding service:', err);
        res.status(500).send('Server error');
    }
});

export default router;
