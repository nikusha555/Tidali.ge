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

// GET - render add slides form
router.get('/', (req, res) => {
    res.render('pages/slider/add-slides');
});

// POST - handle slides creation
router.post('/', upload.single('image'), verifyCsrfAfterUpload, async (req, res) => {
    try {
        const { title } = req.body;
        const filename = req.file?.filename;

        if (!title || !filename) {
            return res.status(400).send('All fields are required including image.');
        }

        
        const image = `/uploads/${filename}`;

        // Insert slide into database
        const query = `
            INSERT INTO slider (title, img_url, created_date)
            VALUES (?, ?, NOW())
        `;
        await connection.query(query, [title, image]);

        // Redirect to form with success (or use flash message if you want)
        res.redirect(`${res.locals.adminBase}/slider`);

    } catch (err) {
        console.error('❌ Error adding slide:', err);
        res.status(500).send('Server error');
    }
});

export default router;
