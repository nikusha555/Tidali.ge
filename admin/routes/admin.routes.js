// admin/routes/adminRoutes.js
import express from 'express';
const router = express.Router();



router.get('/', (req, res) => {
    res.send('Welcome to the Admin Dashboard');
});

export default router;
