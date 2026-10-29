import express from 'express';
import multer from 'multer';
import db from '../../../config/db.conf.js';
import fs from 'fs';
import requireAdmin from '../../middlewares/require.admin.js';
import { storage, uploadedFilePath } from '../../../config/uploads.js';
import { verifyCsrfAfterUpload } from '../../middlewares/csrf.js';


const router = express.Router();


const allowedMediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/ogg'];

const mediaFilter = (req, file, cb) => {
    if (allowedMediaTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image (jpeg, png, webp, gif) or video (mp4, webm, ogg) files are allowed'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: mediaFilter, limits: { fileSize: 50 * 1024 * 1024 } });


// GET /admin/services/:id/edit-services
router.get('/',  requireAdmin, async (req, res) => {
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

router.post('/media/delete-image', async (req, res) => {
    const [[about]] = await db.query(
        'SELECT img_url FROM about LIMIT 1'
    );

    if (about?.img_url) {
        const filePath = uploadedFilePath(about.img_url);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await db.query(
            'UPDATE about SET img_url = NULL'
        );
    }

    res.redirect(`${res.locals.adminBase}/edit-about`);
});


router.post('/media/delete-video', async (req, res) => {
    try {
        const [[about]] = await db.query(
            'SELECT video_url FROM about LIMIT 1'
        );

        if (about?.video_url) {
            const filePath = uploadedFilePath(about.video_url);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            await db.query(
                'UPDATE about SET video_url = NULL'
            );
        }

        res.redirect(`${res.locals.adminBase}/edit-about`);
    } catch (err) {
        console.error('Delete video error:', err);
        res.status(500).send('Error deleting video');
    }
});




// PUT /admin/services/:id
router.post('/update', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 }
]), verifyCsrfAfterUpload, async (req, res) => {
    try {
        const { title, content, m_description, m_keywords } = req.body;

        const image = req.files['image']?.[0]
            ? `/uploads/${req.files['image'][0].filename}`
            : null;

        const video = req.files['video']?.[0]
            ? `/uploads/${req.files['video'][0].filename}`
            : null;

        if (!title || !content || !m_description || !m_keywords) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        let query = `UPDATE about SET title = ?, content = ? , m_description = ? , m_keywords = ?`;
        const params = [title, content, m_description, m_keywords];

        if (image) {
            query += `, img_url = ?`;
            params.push(image);
        }

        if (video) {
            query += `, video_url = ?`;
            params.push(video);
        }

        const [result] = await db.query(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "About not found" });
        }

        res.redirect(`${res.locals.adminBase}/edit-about`);
    } catch (err) {
        console.error("Error updating about:", err);
        res.status(500).json({ message: "Error updating about" });
    }
});









export default router;
