const {
  ValidationError,
  validatePasswordLength,
  validatePasswordMatch,
  emptyToNull,
  filterRecordsByDate,
  sortRecordsByDateDesc
} = require('../util/userDataValidation');

describe('Модуль userDataValidation', () => {
  describe('SuccessCase', () => {
    test('проверка длины пароля — допустимая длина', () => {
      expect(validatePasswordLength('secret12')).toBe(true);
      expect(validatePasswordLength('123456')).toBe(true);
    });

    test('проверка совпадения паролей', () => {
      expect(validatePasswordMatch('my-pass', 'my-pass')).toBe(true);
    });

    test('фильтрация записей по дате', () => {
      const records = [
        { id: 1, createdAt: '2026-01-10T12:00:00.000Z' },
        { id: 2, createdAt: '2026-02-15T12:00:00.000Z' },
        { id: 3, createdAt: '2026-03-20T12:00:00.000Z' }
      ];
      const filtered = filterRecordsByDate(
        records,
        '2026-02-01',
        '2026-02-28'
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(2);
    });

    test('корректная сортировка по дате (убывание)', () => {
      const records = [
        { id: 'a', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', createdAt: '2026-03-01T00:00:00.000Z' },
        { id: 'c', createdAt: '2026-02-01T00:00:00.000Z' }
      ];
      const sorted = sortRecordsByDateDesc(records);
      expect(sorted.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    });

    test('преобразование пустого значения в null', () => {
      expect(emptyToNull('')).toBeNull();
      expect(emptyToNull('   ')).toBeNull();
      expect(emptyToNull(undefined)).toBeNull();
      expect(emptyToNull(null)).toBeNull();
      expect(emptyToNull(0)).toBe(0);
      expect(emptyToNull('text')).toBe('text');
    });
  });

  describe('UnsuccessCase', () => {
    test('проверка пароля недопустимой длины — завершается ошибкой', () => {
      expect(() => validatePasswordLength('123')).toThrow(ValidationError);
      expect(() => validatePasswordLength('')).toThrow(/не короче 6/);
    });

    test('проверка несовпадения паролей — завершается ошибкой', () => {
      expect(() => validatePasswordMatch('password1', 'password2')).toThrow(ValidationError);
      expect(() => validatePasswordMatch('a', 'b')).toThrow(/не совпадают/);
    });
  });
});
