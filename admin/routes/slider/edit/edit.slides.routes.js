import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import db from '../../../../config/db.conf.js';
import { storage, UPLOADS_DIR } from '../../../../config/uploads.js';
import { verifyCsrfAfterUpload } from '../../../middlewares/csrf.js';

const router = express.Router();


const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_MB = 5;

const imageFilter = (req, file, cb) => {
    if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const err = new Error(`Unsupported image type: ${file.mimetype}`);
        err.code = 'UNSUPPORTED_IMAGE_TYPE';
        cb(err, false);
    }
};

const upload = multer({ storage: storage, fileFilter: imageFilter, limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024 } });

// Messages shown on the edit page when an upload is rejected
const uploadErrorMessages = {
    LIMIT_FILE_SIZE: `სურათი ძალიან დიდია. მაქსიმალური ზომაა ${MAX_IMAGE_MB} MB.`,
    UNSUPPORTED_IMAGE_TYPE: 'ფაილის ეს ფორმატი არ არის მხარდაჭერილი. გამოიყენეთ JPG, PNG, WEBP ან GIF.',
};

const log = (id, msg) => console.log(`[slider-edit] id=${id} ${msg}`);

const renderEdit = async (res, id, status = 200, error) => {
    const [[slide]] = await db.query('SELECT * FROM slider WHERE id = ?', [id]);
    if (!slide) {
        return res.status(404).send('Slide not found');
    }
    res.status(status).render('pages/slider/edit-slides', { slide, error });
};

// Runs multer, and shows upload errors on the edit page instead of a bare error response.
// multer removes partially written files itself when it fails.
const uploadImage = (req, res, next) => {
    upload.single('image')(req, res, async (err) => {
        if (!err) return next();
        const message = uploadErrorMessages[err.code];
        if (!message) return next(err);
        log(req.params.id, `upload rejected: ${err.code} (${err.message})`);
        try {
            await renderEdit(res, req.params.id, 400, message);
        } catch (renderErr) {
            next(renderErr);
        }
    });
};


// GET /admin/edit-slides/:id
router.get('/:id', async (req, res) => {
    try {
        await renderEdit(res, req.params.id);
    } catch (err) {
        console.error('Error fetching slide:', err);
        res.status(500).send('Server error');
    }
});


// POST /admin/edit-slides/:id
router.post('/:id', uploadImage, verifyCsrfAfterUpload, async (req, res) => {
    const { id } = req.params;
    const { title } = req.body;
    const image = req.file
        ? `/uploads/${req.file.filename}`
        : null;

    // Removes the new upload when the request is rejected before the DB update
    const discardUpload = () => req.file && fs.unlink(req.file.path).catch(() => {});

    if (req.file) {
        const saved = await fs.stat(req.file.path).then(s => s.size).catch(() => null);
        log(id, `received ${req.file.mimetype} ${req.file.size}B -> ${req.file.path} ` +
            `(on disk: ${saved === null ? 'MISSING' : saved + 'B'}, served dir: ${req.file.destination === UPLOADS_DIR})`);
    } else {
        log(id, 'no new image in request');
    }

    try {
        const [[slide]] = await db.query('SELECT id, img_url FROM slider WHERE id = ?', [id]);
        if (!slide) {
            await discardUpload();
            log(id, 'slide not found');
            return res.status(404).send('Slide not found');
        }

        // Validate required fields
        if (!title || !title.trim()) {
            await discardUpload();
            return await renderEdit(res, id, 400, 'სათაური სავალდებულოა.');
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
            log(id, 'slide disappeared before update');
            return res.status(404).send('Slide not found');
        }

        log(id, `updated (affectedRows=${result.affectedRows}): img_url ` +
            (image ? `${slide.img_url} -> ${image}` : `unchanged (${slide.img_url})`));

        // The previous image file is kept on disk on purpose.
        res.redirect(`${res.locals.adminBase}/slider`);
    } catch (err) {
        // The new file is kept: if the UPDATE did commit, the row points at it.
        console.error(`[slider-edit] id=${id} update failed:`, err);
        res.status(500).send('სერვერზე მოხდა შეცდომა');
    }
});

export default router;
