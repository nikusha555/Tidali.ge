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
router.post('/:id', upload.single('image'), async (req, res) => {
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
        res.redirect('/slider');
    } catch (err) {
        console.error("Error updating slide:", err);
        res.status(500).json({ message: "Error updating slide" });
    }
});

export default router;
