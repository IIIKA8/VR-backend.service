/**
 * Условное логирование: подробные логи только в dev или при LOG_VERBOSE=1.
 * В production без LOG_VERBOSE в файл пишутся только ошибки (console.error).
 */
const isVerbose = process.env.LOG_VERBOSE === '1' || process.env.NODE_ENV !== 'production';

function verboseLog(...args) {
  if (isVerbose) console.log(...args);
}

module.exports = { verboseLog, isVerbose };
