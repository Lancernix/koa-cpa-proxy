/**
 * Local test server for Koa proxy
 * Starts the Koa app without EdgeOne CLI
 */

import 'dotenv/config.js';
import http from 'http';
import app from './node-functions/koa/[[default]].js';

const PORT = process.env.PORT || 8088;

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  // Call Koa app as middleware
  app.callback()(req, res);
});

server.listen(PORT, () => {
  console.log(`✅ Proxy server running on http://localhost:${PORT}`);
  console.log(`\n📝 Environment:`);
  console.log(`   SERVICE_1: ${process.env.SERVICE_1}`);
  console.log(`   SERVICE_2: ${process.env.SERVICE_2}`);
  console.log(`   TIMEOUT_MS: ${process.env.TIMEOUT_MS}`);
  console.log(`\n🧪 Test commands:`);
  console.log(`   curl http://localhost:${PORT}/api/test`);
  console.log(`   curl -X POST http://localhost:${PORT}/api/test -d '{"test":"data"}' -H "Content-Type: application/json"`);
  console.log(`   curl http://localhost:${PORT}/health`);
  console.log(`\n⚠️  Press Ctrl+C to stop`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
