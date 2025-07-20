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


// GET /admin/services/:id/edit-services
router.get('/', async (req, res) => {
    try {
        const [[about]] = await db.query(
            'SELECT * FROM about',

        );

        // Send data to edit-services.ejs
        res.render('pages/about/edit-about', { about });
    } catch (err) {
        console.error('Error fetching about-us:', err);
        res.status(500).send('Server error');
    }
});


// PUT /admin/services/:id
router.post('/', upload.single('image'), async (req, res) => {
    try {
        const { title, content, mini_title } = req.body;
        const image = req.file
            ? `http://localhost:3001/uploads/${req.file.filename}`
            : null;

        // Validate required fields
        if (!title || !content || !mini_title ) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Build dynamic query based on image presence
        let query = `
            UPDATE about 
            SET title = ?, content = ?, mini_title = ?
        `;
        const params = [title, content, mini_title];

        if (image) {
            query += `, img_url = ?`;
            params.push(image);
        }

        const [result] = await db.query(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "about not found" });
        }

        // res.status(200).json({ message: "Service updated successfully" });
        res.redirect('/edit-about');
    } catch (err) {
        console.error("Error updating service:", err);
        res.status(500).json({ message: "Error updating about" });
    }
});

export default router;
