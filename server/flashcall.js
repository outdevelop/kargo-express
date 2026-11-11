// Вход клиента по звонку: клиенту поступает звонок, последние 4 цифры входящего номера — код.
// mock — код придумываем сами и показываем на экране (только для разработки и демонстрации).
// flashcall — боевой режим через flashcall.ru; подключается, когда будет доступ к API.

import crypto from 'node:crypto';

export const FLASHCALL_MODE = process.env.FLASHCALL_MODE || 'mock';

/**
 * Инициирует звонок на номер и возвращает 4-значный код, который клиент должен ввести.
 * @param {string} phone телефон в формате +7XXXXXXXXXX
 * @returns {Promise<string>}
 */
export async function sendCode(phone) {
  if (FLASHCALL_MODE === 'mock') {
    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    console.log(`[flashcall:mock] код для ${phone}: ${code}`);
    return code;
  }
  // TODO: запрос к API flashcall.ru (FLASHCALL_API_KEY) — метод и формат ответа уточнить по документации.
  throw new Error('Вход по звонку ещё не подключён: нет доступа к API flashcall.ru');
}
