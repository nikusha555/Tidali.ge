// admin/routes/adminRoutes.js
import express from 'express';
const router = express.Router();



router.get('/', (req, res) => {
    res.redirect(`${res.locals.adminBase}/login`)
});

export default router;
