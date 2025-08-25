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

// GET - render add slides form
router.get('/', (req, res) => {
    res.render('pages/slider/add-slides');
});

// POST - handle slides creation
router.post('/', upload.single('image'), async (req, res) => {
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
        res.redirect('/slider');

    } catch (err) {
        console.error('❌ Error adding slide:', err);
        res.status(500).send('Server error');
    }
});

export default router;
