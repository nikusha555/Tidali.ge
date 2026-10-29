import express from 'express';
import multer from 'multer';
import db from '../../../../config/db.conf.js';
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

const upload = multer({ storage: storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });


// GET /admin/services/:id/edit-services
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [[slide]] = await db.query(
            'SELECT * FROM slider WHERE id = ?',
            [id]
        );

        if (!slide) {
            return res.status(404).send('Slide not found');
        }

        // Send data to edit-slides.ejs
        res.render('pages/slider/edit-slides', { slide });
    } catch (err) {
        console.error('Error fetching slide:', err);
        res.status(500).send('Server error');
    }
});


// PUT /admin/services/:id
router.post('/:id', upload.single('image'), verifyCsrfAfterUpload, async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        const image = req.file
            ? `/uploads/${req.file.filename}`
            : null; 

        // Validate required fields
        if (!title) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Build dynamic query based on image presence
        let query = `
            UPDATE slider 
            SET title = ?
        `;
        const params = [title];

        if (image) {
            query += `, img_url = ?`;
            params.push(image);
        }

        query += ` WHERE id = ?`;
        params.push(id);

        const [result] = await db.query(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "slide not found" });
        }

        // res.status(200).json({ message: "slide updated successfully" });
        res.redirect(`${res.locals.adminBase}/slider`);
    } catch (err) {
        console.error("Error updating slide:", err);
        res.status(500).json({ message: "Error updating slide" });
    }
});

export default router;
