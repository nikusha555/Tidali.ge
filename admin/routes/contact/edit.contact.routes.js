import express from 'express';
import multer from 'multer';
import path from 'path';
import db from '../../../config/db.conf.js';

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


// GET /admin/contact/edit-contact
router.get('/', async (req, res) => {
    try {
        const [[contact]] = await db.query(
            'SELECT * FROM contact',

        );

        // Send data to edit-contact.ejs
        res.render('pages/contact/edit-contact', { contact });
    } catch (err) {
        console.error('Error fetching contact:', err);
        res.status(500).send('Server error');
    }
});


// PUT /admin/services/:id
router.post('/', upload.fields([
    { name: 'image', maxCount: 1 },

]), async (req, res) => {
    try {
        const { title, email, m_description, m_keywords } = req.body;

        const image = req.files['image']?.[0]
            ? `/uploads/${req.files['image'][0].filename}`
            : null;

        if (!title || !email || !m_description || !m_keywords) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        let query = `UPDATE contact SET title = ?, email = ? , m_description = ? , m_keywords = ?`;
        const params = [title, email, m_description, m_keywords];

        if (image) {
            query += `, img_url = ?`;
            params.push(image);
        }


        const [result] = await db.query(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "About not found" });
        }

        res.redirect('/edit-about');
    } catch (err) {
        console.error("Error updating about:", err);
        res.status(500).json({ message: "Error updating about" });
    }
});


export default router;
