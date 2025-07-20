import express from 'express';
import bcrypt from 'bcryptjs';
import connection from '../../../config/db.conf.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// GET: Show change password form
router.get('/', (req, res) => {
    res.render('pages/auth/change-password'); // Create this EJS file
});

// POST: Handle password update
router.post('/', async (req, res) => {
    const { oldPassword, newPassword, confirmPassword } = req.body;
     const adminId = req.admin?.id; // assuming req.admin is set via JWT middleware
    // const adminId = 2; // or whatever the ID is in your database

    if (!adminId) return res.status(401).send('გთხოვთ თავიდან შედით სისტემაში');

    try {
        // Get current admin data
        const [rows] = await connection.query('SELECT * FROM admin_users WHERE id = ?', [adminId]);
        const admin = rows[0];

        // Check old password
        // Check old password
        const isMatch = (oldPassword, admin.password);
        if (!isMatch) {
            return res.render('pages/auth/change-password', { error: 'ძველი პაროლი არასწორია' });
        }


        if (newPassword !== confirmPassword) {
            return res.render('pages/auth/change-password', { error: 'ახალი პაროლები არ ემთხვევა' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await connection.query('UPDATE admin_users SET password = ? WHERE id = ?', [hashedPassword, adminId]);

        res.redirect('/services')
    } catch (err) {
        console.error(err);
        res.status(500).send('სერვერზე მოხდა შეცდომა');
    }
});

export default router;
