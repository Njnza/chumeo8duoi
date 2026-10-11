/**
 * Real-time Event Bridge (WebSocket + Server-Sent Events)
 * Delivers instant scanner and order events without heavy HTTP polling
 */

const sseClients = new Set();
let wsServer = null;

function setWebSocketServer(server) {
  wsServer = server;
}

function addSseClient(res) {
  sseClients.add(res);
}

function removeSseClient(res) {
  sseClients.delete(res);
}

/**
 * Broadcast an event to all connected clients (SSE & WebSocket)
 * @param {string} type - Event type (e.g. 'scanner:barcode', 'order:created', 'scanner:photo')
 * @param {Object} data - Payload data
 */
function broadcast(type, data) {
  const payload = JSON.stringify({ type, data, timestamp: Date.now() });

  // 1. Broadcast to SSE Clients
  for (const client of sseClients) {
    try {
      client.write(`event: ${type}\ndata: ${payload}\n\n`);
    } catch (_) {
      sseClients.delete(client);
    }
  }

  // 2. Broadcast to WebSocket Clients
  if (wsServer && wsServer.clients) {
    wsServer.clients.forEach(client => {
      try {
        if (client.readyState === 1) { // OPEN
          client.send(payload);
        }
      } catch (_) {}
    });
  }
}

module.exports = {
  setWebSocketServer,
  addSseClient,
  removeSseClient,
  broadcast
};
