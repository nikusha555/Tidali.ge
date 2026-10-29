import jwt from 'jsonwebtoken';
import { isProduction } from '../../config/env.js';

export const ADMIN_COOKIE = 'admin_token';

// Shared by login (set) and logout (clear); clearCookie must use the same
// path/flags or the browser keeps the cookie.
export const adminCookieOptions = (res) => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: res.locals.adminBase, // only sent to the dashboard, not the public site
});

const setAdminLocals = (req, res, next) => {
    const token = req.cookies[ADMIN_COOKIE];

    if (!token) {
        req.admin = null;          // <‑‑ add this line
        res.locals.admin = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

        // ① expose to controllers
        req.admin = decoded;       // <‑‑ add this line

        // ② expose to views
        res.locals.admin = decoded;
    } catch (err) {
        console.error('JWT verify failed:', err.message);
        req.admin = null;
        res.locals.admin = null;
    }

    next();
};

export default setAdminLocals;
