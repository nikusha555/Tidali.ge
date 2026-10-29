import express from 'express';
import multer from 'multer';
import db from '../../../config/db.conf.js';
import fs from 'fs';
import { storage, uploadedFilePath } from '../../../config/uploads.js';
import { verifyCsrfAfterUpload } from '../../middlewares/csrf.js';


const router = express.Router();


const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const imageFilter = (req, file, cb) => {
    if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (jpeg, png, webp, gif) are allowed'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });


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


router.post('/media/delete-image', async (req, res) => {
    try {
        const [[contact]] = await db.query(
            'SELECT img_url FROM contact LIMIT 1'
        );

        if (contact?.img_url) {
            const filePath = uploadedFilePath(contact.img_url);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            await db.query(
                'UPDATE contact SET img_url = NULL'
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});





// PUT /admin/services/:id
router.post('/', upload.fields([
    { name: 'image', maxCount: 1 },

]), verifyCsrfAfterUpload, async (req, res) => {
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

        res.redirect(`${res.locals.adminBase}/edit-contact`);
    } catch (err) {
        console.error("Error updating contact:", err);
        res.status(500).json({ message: "Error updating contact" });
    }
});


export default router;
