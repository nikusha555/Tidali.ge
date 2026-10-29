import express from 'express';
import fs from 'fs/promises';
import db from '../../../../config/db.conf.js';   // ← your existing pool/connection
import { uploadedFilePath } from '../../../../config/uploads.js';

const router = express.Router();

// helper — remove the image file if it’s still on disk
const removeImage = async (imgUrl) => {
    if (!imgUrl) return;
    try {
        const filePath = uploadedFilePath(imgUrl);
        await fs.unlink(filePath);
    } catch (err) {
        // ignore “file not found”, log anything else
        if (err.code !== 'ENOENT') console.error(err);
    }
};

/**
 * POST /delete-slides/:id
 * Immediately deletes the slide and its image, then redirects back.
 */
router.post('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // 1. fetch image name (if you store it)
        const [rows] = await db.query(
            'SELECT img_url FROM slider WHERE id = ? LIMIT 1',
            [id],
        );
        if (rows.length === 0) return res.status(404).send('Slide not found');

        const { img_url } = rows[0];

        // 2. delete the DB row
        await db.query('DELETE FROM slider WHERE id = ?', [id]);

        // 3. delete the file
        await removeImage(img_url);

        // 4. back to the list
        res.redirect(`${res.locals.adminBase}/slider`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Something went wrong while deleting the slide');
    }
});

export default router;
