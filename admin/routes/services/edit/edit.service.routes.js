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
        const [[service]] = await db.query(
            'SELECT * FROM services WHERE id = ?',
            [id]
        );

        if (!service) {
            return res.status(404).send('Service not found');
        }

        // Send data to edit-services.ejs
        res.render('pages/services/edit-services', { service });
    } catch (err) {
        console.error('Error fetching service:', err);
        res.status(500).send('Server error');
    }
});


// PUT /admin/services/:id
router.post('/:id', upload.single('image'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, content, service_type_id } = req.body;
        const image = req.file
            ? `http://localhost:3001/uploads/${req.file.filename}`
            : null;

        // Validate required fields
        if (!name || !content || !service_type_id) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Build dynamic query based on image presence
        let query = `
            UPDATE services 
            SET name = ?, content = ?, service_type_id = ?
        `;
        const params = [name, content, service_type_id];

        if (image) {
            query += `, img_url = ?`;
            params.push(image);
        }

        query += ` WHERE id = ?`;
        params.push(id);

        const [result] = await db.query(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Service not found" });
        }

        // res.status(200).json({ message: "Service updated successfully" });
        res.redirect('/services');
    } catch (err) {
        console.error("Error updating service:", err);
        res.status(500).json({ message: "Error updating service" });
    }
});

export default router;
