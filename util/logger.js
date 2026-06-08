/**
 * @module util/logger
 * @description Условное логирование: подробные логи в dev или при `LOG_VERBOSE=1`.
 */
const isVerbose = process.env.LOG_VERBOSE === '1' || process.env.NODE_ENV !== 'production';

function verboseLog(...args) {
  if (isVerbose) console.log(...args);
}

module.exports = { verboseLog, isVerbose };
