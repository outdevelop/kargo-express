// Общие помощники для личного кабинета и админ-панели.

/** Запрос к API: возвращает JSON или бросает Error с текстом, понятным человеку. */
export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Не получилось выполнить запрос. Попробуйте ещё раз.');
    error.status = response.status;
    throw error;
  }
  return data;
}

/** Создаёт элемент: h('div', { class: 'x', onclick }, 'текст', child). Текст всегда вставляется безопасно. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

export const formatPhone = (p) => p.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 $1 $2-$3-$4');
export const formatDate = (iso) => (iso ? new Date(`${iso}T00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '');
export const formatDateTime = (ms) => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const carsWord = (n) => {
  const d = n % 10, dd = n % 100;
  return `${n} ${d === 1 && dd !== 11 ? 'автомобиль' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'автомобиля' : 'автомобилей'}`;
};

let toastTimer;
export function toast(message, isError = false) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast${isError ? ' toast--error' : ''}`, role: 'status' }, message);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3500);
}

/** Рисует карту с автовозом и линией маршрута; возвращает функцию обновления. Нужен подключённый Leaflet (window.L). */
export function createMap(container) {
  const map = L.map(container, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const truckIcon = L.divIcon({
    className: '', iconSize: [34, 34], iconAnchor: [17, 17],
    html: '<div style="width:34px;height:34px;border-radius:50%;background:#ff6a13;border:4px solid #fff;box-shadow:0 6px 16px rgba(15,26,48,.5)"></div>',
  });
  let marker; let line; let fitted = false;
  return function update({ position, route }) {
    if (route?.from && route?.to && !line) {
      line = L.polyline([route.from, route.to], { color: '#0f1a30', weight: 3, dashArray: '6 8', opacity: .6 }).addTo(map);
      L.circleMarker(route.from, { radius: 6, color: '#0f1a30', fillColor: '#fff', fillOpacity: 1 }).addTo(map);
      L.circleMarker(route.to, { radius: 6, color: '#0f1a30', fillColor: '#0f1a30', fillOpacity: 1 }).addTo(map);
    }
    if (position) {
      const point = [position.lat, position.lon];
      marker ? marker.setLatLng(point) : (marker = L.marker(point, { icon: truckIcon }).addTo(map));
      if (!fitted) {
        line ? map.fitBounds(line.getBounds().extend(point), { padding: [30, 30] }) : map.setView(point, 8);
        fitted = true;
      }
    }
    map.invalidateSize();
  };
}
