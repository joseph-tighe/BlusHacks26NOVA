import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { WebSocketServer } from 'ws';
import http from 'http';
import { registerRoutes } from './endpoints/routes.js';
import { registerWebSocketHandlers } from './controllers/websocketController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const publicDir = path.join(__dirname, 'public');

registerRoutes(app, publicDir);

// Create HTTP server for WebSocket
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });
registerWebSocketHandlers(wss);

function startServer(port) {
  const onError = (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use. Trying ${port + 1}...`);
      server.removeListener('error', onError);
      setTimeout(() => startServer(port + 1), 1000);
    } else {
      console.error('Server error:', error);
      process.exit(1);
    }
  };

  server.once('error', onError);

  server.listen(port, () => {
    console.log(`✨ Server is running at http://localhost:${port}`);
    console.log(`WebSocket endpoint: ws://localhost:${port}`);
  });
}

startServer(PORT);

