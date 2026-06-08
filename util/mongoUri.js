/**
 * @module util/mongoUri
 * @description Сборка строки подключения к MongoDB из переменных окружения.
 */

/**
 * @memberof module:util/mongoUri
 * @returns {string} URI MongoDB
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

/** @memberof module:util/mongoUri */
function mongoUriForLog(uri) {
  return uri.replace(/\/\/([^/]*?)@/, '//***:***@');
}

module.exports = { resolveMongoUri, mongoUriForLog };
