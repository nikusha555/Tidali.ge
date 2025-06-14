import express from 'express';
import adminRoutes from './admin.routes.js';


export default (app) => {
    app.use('/admin', adminRoutes);
    
}