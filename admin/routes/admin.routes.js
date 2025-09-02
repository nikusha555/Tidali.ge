// admin/routes/adminRoutes.js
import express from 'express';
const router = express.Router();



router.get('/', (req, res) => {
    res.redirect('/admin/login')
});

export default router;
