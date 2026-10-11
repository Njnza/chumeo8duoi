const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');
const { setWebSocketServer } = require('./lib/realtime');

// Middleware
const { errorHandler } = require('./middleware/errorHandler');

// Route modules
const { router: productsRouter } = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const customersRouter = require('./routes/customers');
const ordersRouter = require('./routes/orders');
const shiftsRouter = require('./routes/shifts');
const cashFlowRouter = require('./routes/cash-flow');
const reportsRouter = require('./routes/reports');
const settingsRouter = require('./routes/settings');
const usersRouter = require('./routes/users');
const scannerRouter = require('./routes/scanner');
const auditLogsRouter = require('./routes/audit-logs');
const backupRouter = require('./routes/backup');
const realtimeRouter = require('./routes/realtime');
const exportExcelRouter = require('./routes/export-excel');

const app = express();

// Base middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Mount API routes
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/cash-flow', cashFlowRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/users', usersRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/events', realtimeRouter);
app.use('/api/export-excel', exportExcelRouter);
app.use('/api', scannerRouter);

// Serve frontend static files in local dev mode
const srcPath = path.join(__dirname, '..', 'src');
if (fs.existsSync(srcPath)) {
  app.use(express.static(srcPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(srcPath, 'index.html'));
  });
}

// Centralized error handling middleware
app.use(errorHandler);

// For local testing & standalone server with WebSocket
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  const server = http.createServer(app);
  try {
    const wss = new WebSocketServer({ server, path: '/ws' });
    setWebSocketServer(wss);
    console.log('[WebSocket] Real-time server mounted on /ws');
  } catch (err) {
    console.warn('[WebSocket] Warning initializing WebSocket server:', err.message);
  }

  server.listen(PORT, () => {
    console.log(`[Web Server] ShopPro POS running at http://localhost:${PORT}`);
  });
}

module.exports = app;
