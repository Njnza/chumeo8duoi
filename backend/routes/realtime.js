const express = require('express');
const router = express.Router();
const { addSseClient, removeSseClient } = require('../lib/realtime');

// GET /api/events/sse - Server-Sent Events stream
router.get('/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write('event: connected\ndata: {"status":"connected"}\n\n');
  addSseClient(res);

  // Send periodic keep-alive ping every 25 seconds
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    removeSseClient(res);
  });
});

module.exports = router;
