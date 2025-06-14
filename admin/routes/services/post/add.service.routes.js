import express from 'express';
import multer from 'multer';
import path from 'path';
import connection from '../../../../config/db.conf.js';

const router = express.Router();

// Set up Multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join('public', 'uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// POST /admin/services/add
router.post('/', upload.single('image'), async (req, res) => {
    try {
        const { name, content, service_type_id } = req.body;
        const image = req.file ? `/uploads/${req.file.filename}` : null;

        if (!name || !content || !service_type_id || !image) {
            return res.status(400).send('All fields are required including image.');
        }

        const query = `
      INSERT INTO services (name, content, service_type_id, img_url, created_date)
      VALUES (?, ?, ?, ?, NOW())
    `;

        await connection.query(query, [name, content, service_type_id, image]);

        res.send('Service added successfully');

    } catch (err) {
        console.error('Error adding service:', err);
        res.status(500).send('Server error');
    }
});

export default router;
