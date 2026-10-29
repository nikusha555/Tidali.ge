import express from 'express';
import appRoutes from './app.routes.js';
import measurementServicesRoutes from './services/measurement/measurement.routes.js';
import architecturalServicesRoutes from './services/architectural/architectural.routes.js';
import aboutRoutes from './about/about.routes.js';
import serviceDetails from './services/service.details.routes.js';
import contactRoutes from './contact/contact.routes.js';


export default (app) => {
    app.use('/', appRoutes);
    app.use('/services/measurement', measurementServicesRoutes);
    app.use('/services/architectural', architecturalServicesRoutes);
    app.use('/about-us', aboutRoutes);
    app.use('/service/details', serviceDetails);
    app.use('/contact', contactRoutes);
}