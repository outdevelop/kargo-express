// Связь с системой ГЛОНАСС-мониторинга.
// mock — демо-автовозы, которые «едут» по маршруту заявки (для разработки и демонстрации).
// real — запросы к серверу мониторинга; подключается, когда будет описание его API.

export const GLONASS_MODE = process.env.GLONASS_MODE || 'mock';

const CITIES = {
  'набережные челны': [55.7436, 52.3958], 'казань': [55.7961, 49.1064], 'москва': [55.7558, 37.6173],
  'екатеринбург': [56.8389, 60.6057], 'самара': [53.1959, 50.1002], 'уфа': [54.7388, 55.9721],
  'ижевск': [56.8527, 53.2115], 'нижний новгород': [56.3269, 44.0059], 'санкт-петербург': [59.9343, 30.3351],
  'пермь': [58.0105, 56.2502], 'челябинск': [55.1644, 61.4368], 'тольятти': [53.5078, 49.4204],
  'оренбург': [51.7682, 55.097], 'новосибирск': [55.0084, 82.9357], 'краснодар': [45.0355, 38.9753],
  'ростов-на-дону': [47.2357, 39.7015], 'тюмень': [57.153, 65.5343], 'владивосток': [43.1155, 131.8855],
  'нижнекамск': [55.6366, 51.8245], 'елабуга': [55.7567, 52.0543], 'альметьевск': [54.9014, 52.2973],
  'воронеж': [51.6608, 39.2003], 'волгоград': [48.708, 44.5133], 'саратов': [51.5336, 46.0343],
  'ульяновск': [54.3142, 48.4031], 'чебоксары': [56.1439, 47.2489], 'киров': [58.6035, 49.668],
};

/** Координаты города по названию или null, если город не из списка. */
export function cityCoords(name) {
  return CITIES[String(name ?? '').trim().toLowerCase().replace(/^г\.?\s*/, '')] ?? null;
}

const MOCK_TRACKERS = [
  { id: 'demo-1', name: 'Автовоз 1 (демо)' },
  { id: 'demo-2', name: 'Автовоз 2 (демо)' },
  { id: 'demo-3', name: 'Автовоз 3 (демо)' },
  { id: 'demo-4', name: 'Автовоз 4 (демо)' },
];

/** Список машин с трекерами: [{ id, name }]. */
export async function listTrackers() {
  if (GLONASS_MODE === 'mock') return MOCK_TRACKERS;
  // TODO: список объектов с сервера мониторинга (GLONASS_URL, GLONASS_LOGIN, GLONASS_PASSWORD).
  throw new Error('ГЛОНАСС ещё не подключён: нет описания API сервера мониторинга');
}

/**
 * Текущее положение машины.
 * @param {string} trackerId
 * @param {{ from: string, to: string }} route маршрут заявки — нужен только демо-режиму
 * @returns {Promise<{ lat: number, lon: number, speed: number, time: number } | null>}
 */
export async function getPosition(trackerId, route) {
  if (GLONASS_MODE === 'mock') {
    const index = MOCK_TRACKERS.findIndex((t) => t.id === trackerId);
    if (index < 0) return null;
    const from = cityCoords(route.from) ?? CITIES['набережные челны'];
    const to = cityCoords(route.to) ?? [from[0] + 0.6, from[1] - 1.5];
    // Демо: автовоз проходит маршрут за полтора часа и начинает заново.
    const period = 90 * 60;
    const progress = 0.05 + 0.9 * (((Date.now() / 1000 + index * 1300) % period) / period);
    return {
      lat: from[0] + (to[0] - from[0]) * progress,
      lon: from[1] + (to[1] - from[1]) * progress,
      speed: 68 + ((Math.floor(Date.now() / 60000) + index) % 5) * 4,
      time: Date.now(),
    };
  }
  // TODO: последнее сообщение объекта с сервера мониторинга.
  throw new Error('ГЛОНАСС ещё не подключён: нет описания API сервера мониторинга');
}
