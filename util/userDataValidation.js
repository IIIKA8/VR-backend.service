/**
 * @module util/userDataValidation
 * @description
 * Валидация пользовательских данных: длина и совпадение паролей,
 * фильтрация и сортировка записей по дате, нормализация пустых полей.
 * Используется в {@link module:routes/auth} и админ API.
 */

/** Минимальная длина пароля. @memberof module:util/userDataValidation @constant {number} */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Ошибка валидации входных данных.
 * @memberof module:util/userDataValidation
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * @memberof module:util/userDataValidation
 * @param {string} password
 * @param {number} [minLength=6]
 * @returns {boolean}
 * @throws {ValidationError}
 */
function validatePasswordLength(password, minLength = MIN_PASSWORD_LENGTH) {
  const value = password == null ? '' : String(password);
  if (!value || value.length < minLength) {
    throw new ValidationError(`Пароль должен быть не короче ${minLength} символов`);
  }
  return true;
}

/**
 * @memberof module:util/userDataValidation
 * @throws {ValidationError}
 */
function validatePasswordMatch(password, confirmPassword) {
  const a = password == null ? '' : String(password);
  const b = confirmPassword == null ? '' : String(confirmPassword);
  if (a !== b) {
    throw new ValidationError('Пароли не совпадают');
  }
  return true;
}

/** @memberof module:util/userDataValidation */
function emptyToNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

/** @memberof module:util/userDataValidation */
function filterRecordsByDate(records, fromDate, toDate, dateField = 'createdAt') {
  const list = Array.isArray(records) ? records : [];
  const from = fromDate != null && fromDate !== '' ? new Date(fromDate).getTime() : null;
  const to = toDate != null && toDate !== '' ? new Date(toDate).getTime() : null;

  return list.filter((record) => {
    const t = new Date(record[dateField]).getTime();
    if (Number.isNaN(t)) return false;
    if (from != null && t < from) return false;
    if (to != null && t > to) return false;
    return true;
  });
}

/** @memberof module:util/userDataValidation */
function sortRecordsByDateDesc(records, dateField = 'createdAt') {
  const list = Array.isArray(records) ? records : [];
  return [...list].sort((a, b) => new Date(b[dateField]) - new Date(a[dateField]));
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  ValidationError,
  validatePasswordLength,
  validatePasswordMatch,
  emptyToNull,
  filterRecordsByDate,
  sortRecordsByDateDesc
};
