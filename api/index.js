// Vercel Serverless Function Entry Point
// Routes all /api/* requests into the unified Express application
const app = require('../backend/app');

module.exports = app;
