/**
 * Единая сборка URI для server.js, seed.js, seed-bulk.js.
 * Приоритет: MONGO_USER+MONGO_PASSWORD+MONGO_HOST+MONGO_DB → MONGODB_URI → без auth.
 */
function resolveMongoUri() {
  const host = process.env.MONGO_HOST || 'localhost';
  const db = process.env.MONGO_DB || 'vr-app';
  const user = process.env.MONGO_USER;
  const pass = process.env.MONGO_PASSWORD;
  if (user && pass) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);
    return `mongodb://${u}:${p}@${host}:27017/${db}?authSource=admin`;
  }
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }
  return `mongodb://${host}:27017/${db}`;
}

function mongoUriForLog(uri) {
  return uri.replace(/\/\/([^/]*?)@/, '//***:***@');
}

module.exports = { resolveMongoUri, mongoUriForLog };
