// admin/routes/adminRoutes.js
import express from 'express';
const router = express.Router();



 router.get('/', (req, res) => {
     res.redirect('/services')
 });

export default router;
