import { api, h, formatPhone, formatDateTime, toast, createMap } from '/common.js';

const $ = (id) => document.getElementById(id);
const state = { orders: [], statuses: {}, trackers: [], filter: 'all', query: '', editing: null };

/* ---------- Вход ---------- */

async function boot() {
  const me = await api('/api/me');
  if (me.role === 'admin') return showPanel();
  $('login').hidden = false;
  $('login-form').elements.password.focus();
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('login-error');
  error.hidden = true;
  try {
    await api('/api/auth/admin', { method: 'POST', body: { password: event.target.elements.password.value } });
    $('login').hidden = true;
    await showPanel();
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
  }
});

$('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
});

/* ---------- Список заявок ---------- */

async function showPanel() {
  $('panel').hidden = false;
  $('logout').hidden = false;
  await load();
}

async function load() {
  try {
    const data = await api('/api/admin/orders');
    Object.assign(state, { orders: data.orders, statuses: data.statuses, trackers: data.trackers });
    const notes = [];
    if (data.trackersError) notes.push(data.trackersError);
    else if (data.modes.glonass === 'mock') notes.push('ГЛОНАСС в демо-режиме: автовозы в списке ненастоящие.');
    if (data.modes.flashcall === 'mock') notes.push('Вход клиентов в демо-режиме: код показывается на экране, звонка нет.');
    $('notice').textContent = notes.join(' ');
    $('notice').hidden = !notes.length;
    render();
  } catch (e) {
    if (e.status === 401) return location.reload();
    toast(e.message, true);
  }
}

function visibleOrders() {
  const q = state.query.trim().toLowerCase();
  return state.orders.filter((o) => {
    if (state.filter !== 'all' && o.status !== state.filter) return false;
    if (!q) return true;
    return [o.number, o.clientPhone, o.clientName, o.fromCity, o.toCity, o.cars].join(' ').toLowerCase().includes(q)
      || o.clientPhone.includes(q.replace(/\D/g, '') || '§');
  });
}

function render() {
  // Фильтры со счётчиками
  const counts = { all: state.orders.length };
  for (const o of state.orders) counts[o.status] = (counts[o.status] ?? 0) + 1;
  $('filters').replaceChildren(
    ...[['all', 'Все'], ...Object.entries(state.statuses)].map(([key, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(state.filter === key), onclick: () => { state.filter = key; render(); } },
        label, h('b', {}, String(counts[key] ?? 0)))),
  );

  const list = visibleOrders();
  $('rows').replaceChildren(...list.map(row));
  const empty = $('empty');
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.replaceChildren(...(state.orders.length
      ? [h('b', {}, 'Ничего не нашлось'), 'Измените фильтр или строку поиска.']
      : [h('b', {}, 'Заявок пока нет'), 'Нажмите «Добавить заявку» — или дождитесь первой заявки с сайта.']));
  }
}

function row(o) {
  const statusSelect = h('select', { class: 'inline-select', 'aria-label': `Статус заявки ${o.number}`,
    onchange: (e) => patch(o.id, { status: e.target.value }, `${o.number}: статус — ${state.statuses[e.target.value]}`) },
  Object.entries(state.statuses).map(([key, label]) => h('option', { value: key, selected: key === o.status }, label)));

  const trackerSelect = h('select', { class: 'inline-select', 'aria-label': `Автовоз для заявки ${o.number}`,
    onchange: (e) => patch(o.id, { trackerId: e.target.value }, e.target.value ? `${o.number}: автовоз привязан` : `${o.number}: автовоз отвязан`) },
  trackerOptions(o.trackerId));

  return h('tr', {},
    h('td', { class: 'num' }, o.number, o.source === 'site' ? h('small', {}, 'с сайта') : null),
    h('td', {}, h('a', { href: `tel:${o.clientPhone}` }, formatPhone(o.clientPhone)), h('small', {}, o.clientName || '—')),
    h('td', {}, `${o.fromCity} → ${o.toCity}`, o.eta ? h('small', {}, `доставка ${o.eta.split('-').reverse().join('.')}`) : null),
    h('td', {}, String(o.carsCount), h('small', {}, o.cars || '—')),
    h('td', {}, statusSelect),
    h('td', {}, trackerSelect),
    h('td', {}, h('small', {}, formatDateTime(o.updatedAt))),
    h('td', {}, h('div', { class: 'row-actions' },
      o.trackerId ? h('button', { class: 'btn btn--plain btn--small', type: 'button', onclick: () => openMap(o) }, 'На карте') : null,
      h('button', { class: 'btn btn--plain btn--small', type: 'button', onclick: () => openOrder(o) }, 'Открыть'))),
  );
}

function trackerOptions(selected) {
  const options = [h('option', { value: '' }, 'Не привязан')];
  for (const t of state.trackers) options.push(h('option', { value: t.id, selected: t.id === selected }, t.name));
  // Трекер привязан, но в списке его больше нет — показываем как есть, чтобы не потерять привязку.
  if (selected && !state.trackers.some((t) => t.id === selected)) options.push(h('option', { value: selected, selected: true }, `${selected} (нет в списке)`));
  return options;
}

async function patch(id, changes, message) {
  try {
    const updated = await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: changes });
    state.orders = state.orders.map((o) => (o.id === id ? updated : o));
    toast(message);
  } catch (e) {
    toast(e.message, true);
  }
  render();
}

$('search').addEventListener('input', (e) => { state.query = e.target.value; render(); });

/* ---------- Карточка заявки ---------- */

const dialog = $('order-dialog');
const form = $('order-form');

function openOrder(order) {
  state.editing = order;
  $('order-title').textContent = order ? `Заявка ${order.number}` : 'Новая заявка';
  $('order-delete').hidden = !order;
  $('order-error').hidden = true;
  form.elements.status.replaceChildren(...Object.entries(state.statuses).map(([key, label]) => h('option', { value: key }, label)));
  form.elements.trackerId.replaceChildren(...trackerOptions(order?.trackerId ?? ''));
  const values = order ?? { clientPhone: '', clientName: '', fromCity: 'Набережные Челны', toCity: '', carsCount: 1, eta: '', cars: '', status: 'confirmed', trackerId: '', comment: '' };
  for (const name of ['clientPhone', 'clientName', 'fromCity', 'toCity', 'carsCount', 'eta', 'cars', 'status', 'trackerId', 'comment']) {
    form.elements[name].value = values[name];
  }
  dialog.showModal();
}

$('add').addEventListener('click', () => openOrder(null));
$('order-cancel').addEventListener('click', () => dialog.close());

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  body.carsCount = Number(body.carsCount);
  const error = $('order-error');
  error.hidden = true;
  try {
    const saved = state.editing
      ? await api(`/api/admin/orders/${state.editing.id}`, { method: 'PATCH', body })
      : await api('/api/admin/orders', { method: 'POST', body });
    state.orders = state.editing ? state.orders.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...state.orders];
    dialog.close();
    toast(state.editing ? `Заявка ${saved.number} сохранена` : `Заявка ${saved.number} добавлена`);
    render();
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
  }
});

$('order-delete').addEventListener('click', async () => {
  const order = state.editing;
  if (!confirm(`Удалить заявку ${order.number}? Вернуть её будет нельзя.`)) return;
  try {
    await api(`/api/admin/orders/${order.id}`, { method: 'DELETE' });
    state.orders = state.orders.filter((o) => o.id !== order.id);
    dialog.close();
    toast(`Заявка ${order.number} удалена`);
    render();
  } catch (e) {
    toast(e.message, true);
  }
});

/* ---------- Карта ---------- */

const mapDialog = $('map-dialog');
let mapTimer;

async function openMap(order) {
  $('map-title').textContent = `${order.number}: ${order.fromCity} → ${order.toCity}`;
  $('map-meta').textContent = 'Загружаем положение автовоза…';
  $('map').replaceWith(h('div', { class: 'map', id: 'map' })); // новая карта на каждое открытие
  mapDialog.showModal();
  const update = createMap($('map'));
  const refresh = async () => {
    try {
      const data = await api(`/api/admin/orders/${order.id}/position`);
      update(data);
      $('map-meta').textContent = data.position
        ? `Скорость ${Math.round(data.position.speed)} км/ч · данные на ${new Date(data.position.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : 'Трекер не передал координаты.';
    } catch (e) {
      $('map-meta').textContent = e.message;
    }
  };
  await refresh();
  mapTimer = setInterval(refresh, 30000);
}
mapDialog.addEventListener('close', () => clearInterval(mapTimer));
$('map-close').addEventListener('click', () => mapDialog.close());

boot().catch((e) => toast(e.message, true));
