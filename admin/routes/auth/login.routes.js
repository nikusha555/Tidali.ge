import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import connection from '../../../config/db.conf.js'; // Adjust path as needed
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

router.get('/', (req, res) => {
    res.render('pages/auth/login');
});

router.post('/', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await connection.query(
            'SELECT * FROM admin_users WHERE username = ? LIMIT 1',
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).render('pages/auth/login', {
                error: 'მომხმარებელი ვერ მოიძებნა',
            });
        }

        const admin = rows[0];

        // Compare password (assuming it's hashed)
        // const isMatch = password === admin.password;

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).render('pages/auth/login', {
                error: 'პაროლი არასწორია',
            });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: admin.id, username: admin.username },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        // Set JWT in cookie (you can also return it in JSON if you're using frontend)
        res.cookie('admin_token', token, {
            httpOnly: true,
            secure: false, // true if using https
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        return res.status(200).render('pages/auth/login', {
            error: 'წარმატებულია',
        });
        // res.redirect('/admin/dashboard'); // Change to your desired admin page
    } catch (err) {
        console.error(err);
        res.status(500).send('სერვერზე მოხდა შეცდომა');
    }
});

export default router;
