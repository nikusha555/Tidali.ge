// Shared upload location for admin forms and the public /uploads URL.
// Set UPLOADS_DIR to a folder outside the application root in production so
// uploaded files survive redeploys; defaults to <project root>/public/uploads.
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { ROOT_DIR } from './env.js';

export const UPLOADS_DIR = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(ROOT_DIR, 'public', 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Maps a stored URL such as "/uploads/image-123.jpg" to its file on disk.
// basename() keeps the result inside UPLOADS_DIR.
export const uploadedFilePath = (url) => path.join(UPLOADS_DIR, path.basename(url));
