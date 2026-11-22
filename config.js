require('dotenv').config({ quiet: true });

function loadConfig() {
  const { MONGODB_URI, JWT_SECRET, NODE_ENV, PORT = '3000' } = process.env;
  if (!MONGODB_URI || !JWT_SECRET || Buffer.byteLength(JWT_SECRET) < 32) {
    throw new Error('Set MONGODB_URI and a random JWT_SECRET of at least 32 bytes.');
  }
  const port = Number(PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port.');
  }
  return { mongoUri: MONGODB_URI, secret: JWT_SECRET, production: NODE_ENV === 'production', port };
}

module.exports = { loadConfig };
