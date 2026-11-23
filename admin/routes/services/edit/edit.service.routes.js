import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
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

const log = (id, message) => console.log(`[service-edit] id=${id} ${message}`);

// Removes files uploaded by a rejected request (never previously stored images).
const discardUploads = (files) => Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));

// GET edit service (with gallery images)
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [[service]] = await db.query('SELECT * FROM services WHERE id = ?', [id]);
        if (!service) return res.status(404).send('Service not found');

        const [gallery] = await db.query('SELECT * FROM service_gallery WHERE service_id = ?', [id]);

        res.render('pages/services/edit-services', { service, gallery });
    } catch (err) {
        console.error('Error fetching service:', err);
        res.status(500).send('Server error');
    }
});

// POST update service + optional gallery upload
router.post('/:id', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'gallery', maxCount: 10 }
]), verifyCsrfAfterUpload, async (req, res) => {
    const { id } = req.params;
    try {
        const { name, content, service_type_id, m_description, m_keywords } = req.body;

        // Diagnostics: field values are shortened; _csrf is never logged.
        const short = (v) => typeof v === 'string' ? JSON.stringify(v.slice(0, 80)) : String(v);
        log(id, `fields: name=${short(name)} content_length=${content?.length ?? 'missing'} ` +
            `service_type_id=${short(service_type_id)} m_description_length=${m_description?.length ?? 'missing'} ` +
            `m_keywords=${short(m_keywords)}`);
        const files = Object.values(req.files || {}).flat();
        log(id, files.length
            ? 'files: ' + files.map(f => `${f.fieldname}:${JSON.stringify(f.originalname)} ${f.mimetype} ${f.size}B -> ${f.filename}`).join(', ')
            : 'files: none');

        // Without these the UPDATE would write NULLs over the stored values.
        if (!name || !content || !service_type_id) {
            log(id, 'rejected: name, content or service_type_id missing from request body');
            await discardUploads(files);
            return res.status(400).send('სახელი, აღწერა და კატეგორია სავალდებულოა. ცვლილებები არ შენახულა.');
        }

        const mainImage = req.files['image']
            ? `/uploads/${req.files['image'][0].filename}`
            : null;

        // ✅ Update main service data
        let query = `
            UPDATE services 
            SET name = ?, content = ?, service_type_id = ?, m_description = ?, m_keywords = ?
        `;
        const params = [name, content, service_type_id, m_description, m_keywords];

        if (mainImage) {
            query += `, img_url = ?`;
            params.push(mainImage);
        }

        query += ` WHERE id = ?`;
        params.push(id);

        const [result] = await db.query(query, params);
        // mysql2 reports matched rows as affectedRows; changedRows=0 just means
        // the submitted values equal the stored ones, which is not a failure.
        log(id, `UPDATE affectedRows=${result.affectedRows} changedRows=${result.changedRows}`);

        if (result.affectedRows === 0) {
            log(id, 'UPDATE matched no row: service does not exist');
            await discardUploads(files);
            return res.status(404).send('სერვისი ვერ მოიძებნა. ცვლილებები არ შენახულა.');
        }

        // Read the row back to confirm what the database now holds.
        const [[saved]] = await db.query(
            'SELECT name, service_type_id, img_url, CHAR_LENGTH(content) AS content_length FROM services WHERE id = ?',
            [id]
        );
        log(id, `stored: name=${short(saved?.name)} service_type_id=${saved?.service_type_id} ` +
            `img_url=${saved?.img_url} content_length=${saved?.content_length}`);
        if (!saved || saved.name !== name || String(saved.service_type_id) !== String(service_type_id)) {
            console.error(`[service-edit] id=${id} stored row does not match the submitted values`);
            return res.status(500).send('სერვისის განახლება ვერ დადასტურდა. სცადეთ თავიდან.');
        }

        // ✅ Insert new gallery images if any
        if (req.files['gallery'] && req.files['gallery'].length > 0) {
            const values = req.files['gallery'].map(file => [id, `/uploads/${file.filename}`]);
            const [galleryResult] = await db.query('INSERT INTO service_gallery (service_id, img_url) VALUES ?', [values]);
            log(id, `gallery: inserted ${galleryResult.affectedRows} image(s)`);
        }

        res.redirect(`${res.locals.adminBase}/services`);
    } catch (err) {
        console.error(`[service-edit] id=${id} error updating service:`, err.stack || err);
        res.status(500).json({ message: "Error updating service" });
    }
});

// GET gallery delete page
router.get('/:id/gallery-delete', async (req, res) => {
    const { id } = req.params;

    try {
        const [[service]] = await db.query('SELECT * FROM services WHERE id = ?', [id]);
        if (!service) return res.status(404).send('Service not found');

        const [gallery] = await db.query('SELECT * FROM service_gallery WHERE service_id = ?', [id]);

        res.render('pages/services/gallery-delete-form', { service, gallery });
    } catch (err) {
        console.error('Error loading gallery delete page:', err);
        res.status(500).send('Server error');
    }
});

// DELETE gallery image
router.post('/:id/gallery/:imageId/delete', async (req, res) => {
    const { id, imageId } = req.params;

    try {
        const [result] = await db.query(
            'DELETE FROM service_gallery WHERE id = ? AND service_id = ?',
            [imageId, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Image not found' });
        }

        res.redirect(`${res.locals.adminBase}/edit-services/${id}/gallery-delete`);
    } catch (err) {
        console.error("Error deleting gallery image:", err);
        res.status(500).json({ message: "Error deleting image" });
    }
});



export default router;
