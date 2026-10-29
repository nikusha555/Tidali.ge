import express from 'express';
import bcrypt from 'bcryptjs';
import connection from '../../../config/db.conf.js';

const router = express.Router();

const MIN_PASSWORD_LENGTH = 8;

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

    // Validate input before touching the database
    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string' || !oldPassword) {
        return res.status(400).render('pages/auth/change-password', { error: 'შეავსეთ ყველა ველი' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(400).render('pages/auth/change-password', { error: 'ახალი პაროლები არ ემთხვევა' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).render('pages/auth/change-password', {
            error: `ახალი პაროლი უნდა შეიცავდეს მინიმუმ ${MIN_PASSWORD_LENGTH} სიმბოლოს`,
        });
    }

    try {
        // Get current admin data
        const [rows] = await connection.query('SELECT * FROM admin_users WHERE id = ?', [adminId]);
        const admin = rows[0];
        if (!admin) return res.status(401).send('გთხოვთ თავიდან შედით სისტემაში');

        // Check old password
        const isMatch = await bcrypt.compare(oldPassword, admin.password);
        if (!isMatch) {
            return res.status(400).render('pages/auth/change-password', { error: 'ძველი პაროლი არასწორია' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await connection.query('UPDATE admin_users SET password = ? WHERE id = ?', [hashedPassword, adminId]);

        res.redirect(`${res.locals.adminBase}/services`)
    } catch (err) {
        console.error(err);
        res.status(500).send('სერვერზე მოხდა შეცდომა');
    }
});

export default router;
