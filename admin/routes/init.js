import express from 'express';
import adminRoutes from "./admin.routes.js";
import loginRoutes from './auth/login.routes.js';
import changePassRoutes from './auth/change-pass.routes.js';
import services from './services/get/admin.services.routes.js';
import addServicesRoutes from './services/post/add.service.routes.js';
import editServices from './services/edit/edit.service.routes.js';
import deleteServices from './services/delete/delete.service.routes.js';
import requireAdmin from '../middlewares/require.admin.js';
import editAbout from './about/edit.about.routes.js';
import editContact from './contact/edit.contact.routes.js';


export default (app) => {
    app.use('/', adminRoutes)
    app.use('/admin/login', loginRoutes);
    app.use('/admin/change-password', requireAdmin, changePassRoutes);
    app.use('/services', services);
    app.use('/add-services', requireAdmin, addServicesRoutes);
    app.use('/edit-services', requireAdmin, editServices);
    app.use('/delete-services', requireAdmin, deleteServices);
    app.use('/edit-about', requireAdmin, editAbout);
    app.use('/edit-contact', requireAdmin, editContact);

}