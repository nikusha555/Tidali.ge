import express from 'express';
import { ADMIN_COOKIE, adminCookieOptions } from '../../middlewares/admin.safety.js';
import { issueCsrfSecret } from '../../middlewares/csrf.js';

const router = express.Router();

// POST only (CSRF-checked by the app-wide middleware). Clears the JWT cookie
// in this browser; the token itself stays valid until it expires, since the
// app keeps no server-side session list.
router.post('/', (req, res) => {
    res.clearCookie(ADMIN_COOKIE, adminCookieOptions(res));
    // cookies issued before the cookie was scoped to the dashboard path
    res.clearCookie(ADMIN_COOKIE, { ...adminCookieOptions(res), path: '/' });
    issueCsrfSecret(res);
    res.redirect(`${res.locals.adminBase}/login`);
});

export default router;
