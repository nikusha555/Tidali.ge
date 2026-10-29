// middlewares/requireAdmin.js
const requireAdmin = (req, res, next) => {
    if (!req.admin) {
        return res.redirect(`${res.locals.adminBase}/login`);   // or res.status(401).send('Unauthorized');
    }
    next();
};
export default requireAdmin;
