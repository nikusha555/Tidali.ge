import express from 'express';
import loginRoutes from './auth/login.routes.js';
import changePassRoutes from './auth/change-pass.routes.js'


export default (app) => {
    app.use('/admin/login', loginRoutes);
    app.use('/admin/change-password', changePassRoutes)
}