import express from 'express';
import appRoutes from './app.routes.js';
import measurementServicesRoutes from './services/measurement/get/measurement.routes.js';
import architecturalServicesRoutes from './services/architectural/get/architectural.routes.js';
import adminServicesRoutes from '../../admin/routes/services/get/admin.services.routes.js';
import addServicesRoutes from '../../admin/routes/services/post/add.service.routes.js'


export default (app) => {
    app.use('/home', appRoutes);
    app.use('/services/measurement', measurementServicesRoutes);
    app.use('/services/architectural', architecturalServicesRoutes);
    app.use('/admin-services', adminServicesRoutes);
    app.use('/addService', addServicesRoutes)
}