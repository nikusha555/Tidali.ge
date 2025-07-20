import jwt from 'jsonwebtoken';

const setAdminLocals = (req, res, next) => {
    const token = req.cookies.admin_token;

    if (!token) {
        req.admin = null;          // <‑‑ add this line
        res.locals.admin = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // ① expose to controllers
        req.admin = decoded;       // <‑‑ add this line

        // ② expose to views
        res.locals.admin = decoded;
    } catch (err) {
        console.error('JWT verify failed:', err);
        req.admin = null;
        res.locals.admin = null;
    }

    next();
};

export default setAdminLocals;
