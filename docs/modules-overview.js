/**
 * @fileoverview Сводный перечень программных модулей проекта (рисунок 24).
 *
 * Ниже перечислены основные модули, документированные в исходном коде.
 * Полный интерактивный список — на странице **Modules** после `npm run docs`.
 *
 * ### Сервер и middleware
 * - {@link module:server} — точка входа Express, сессии, guards, health
 *
 * ### Маршруты REST API (`/api/...`)
 * - {@link module:routes/auth} — авторизация и сессия
 * - {@link module:routes/users} — пользователи
 * - {@link module:routes/devices} — VR-устройства
 * - {@link module:routes/sessions} — VR-сеансы
 * - {@link module:routes/scenes} — сцены
 * - {@link module:routes/licenses} — лицензии
 * - {@link module:routes/usagePeriods} — периоды использования
 * - {@link module:routes/doctor} — кабинет врача
 * - {@link module:routes/patient} — кабинет пациента
 * - {@link module:routes/vr} — результаты упражнений
 *
 * ### Модели данных (Mongoose)
 * - {@link module:models/User}
 * - {@link module:models/Device}
 * - {@link module:models/VRScene}
 * - {@link module:models/VRSession}
 * - {@link module:models/License}
 * - {@link module:models/UsagePeriod}
 * - {@link module:models/MedicalNote}
 * - {@link module:models/VRExerciseResult}
 *
 * ### Утилиты
 * - {@link module:util/userDataValidation} — валидация паролей и записей
 * - {@link module:util/mongoUri} — строка подключения MongoDB
 * - {@link module:util/rehabAnalytics} — аналитика реабилитации
 * - {@link module:util/logger} — логирование
 *
 * @module vr-backend/index
 */

module.exports = {};
