import { api, h, formatPhone, formatDate, carsWord, toast, createMap } from '/common.js';

const $ = (id) => document.getElementById(id);
const STEPS = ['confirmed', 'loading', 'transit', 'delivered'];
const REFRESH_MS = 30000;
let phone = '';
const timers = [];
const afterMount = []; // то, что можно запускать только когда карточки уже в документе (карты)

function show(id) {
  for (const section of ['step-phone', 'step-code', 'cabinet']) $(section).hidden = section !== id;
}

function showError(id, message) {
  const el = $(id);
  el.textContent = message ?? '';
  el.hidden = !message;
}

/* ---------- Вход по звонку ---------- */

$('phone-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('[type="submit"]');
  showError('phone-error');
  button.disabled = true;
  try {
    phone = event.target.elements.phone.value;
    const result = await api('/api/auth/code', { method: 'POST', body: { phone } });
    $('code-phone').textContent = phone;
    $('demo').hidden = !result.demoCode;
    $('demo-code').textContent = result.demoCode ?? '';
    $('code-form').reset();
    showError('code-error');
    show('step-code');
    $('code-form').elements.code.focus();
  } catch (e) {
    showError('phone-error', e.message);
  } finally {
    button.disabled = false;
  }
});

$('code-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('code-error');
  try {
    await api('/api/auth/verify', { method: 'POST', body: { phone, code: event.target.elements.code.value.trim() } });
    await openCabinet();
  } catch (e) {
    showError('code-error', e.message);
  }
});

$('change-phone').addEventListener('click', () => show('step-phone'));

$('logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
});

/* ---------- Заявки ---------- */

async function openCabinet() {
  const me = await api('/api/me');
  if (me.role !== 'client') return show('step-phone');
  $('who').textContent = formatPhone(me.phone);
  $('logout').hidden = false;
  show('cabinet');
  await loadOrders();
}

async function loadOrders() {
  timers.splice(0).forEach(clearInterval);
  const { orders, statuses } = await api('/api/my/orders');
  const list = $('orders');
  if (!orders.length) {
    list.replaceChildren(h('div', { class: 'order' },
      h('h2', {}, 'Активных перевозок нет'),
      h('p', { class: 'muted' }, 'Когда диспетчер оформит заявку на ваш номер, она появится здесь.'),
      h('a', { class: 'btn btn--accent', href: '/#top' }, 'Рассчитать перевозку')));
    return;
  }
  list.replaceChildren(...orders.map((order) => orderCard(order, statuses)));
  afterMount.splice(0).forEach((run) => run());
}

function orderCard(order, statuses) {
  const stepIndex = STEPS.indexOf(order.status);
  const card = h('article', { class: 'order' },
    h('div', { class: 'order__top' },
      h('span', { class: 'order__num' }, `Заявка ${order.number}`),
      h('span', { class: `badge s-${order.status}` }, statuses[order.status])),
    h('h2', { class: 'order__route' }, order.fromCity, h('span', {}, ' → '), order.toCity),
    h('div', { class: 'order__facts' },
      h('span', {}, h('b', {}, carsWord(order.carsCount)), order.cars ? ` — ${order.cars}` : ''),
      order.eta ? h('span', {}, 'Плановая доставка: ', h('b', {}, formatDate(order.eta))) : null),
    order.status === 'new'
      ? h('p', { class: 'muted' }, 'Заявка принята. Диспетчер свяжется с вами, чтобы согласовать цену и дату погрузки.')
      : h('ol', { class: 'progress' }, STEPS.map((step, i) =>
        h('li', { class: i < stepIndex ? 'is-done' : i === stepIndex ? 'is-now' : '' }, statuses[step]))),
  );

  if (order.tracking) {
    const mapBox = h('div', { class: 'map' });
    const meta = h('p', { class: 'map-meta' }, 'Загружаем положение автовоза…');
    card.append(mapBox, meta);
    // Leaflet нужно создавать, когда блок уже в документе и имеет размер.
    afterMount.push(() => {
      const update = createMap(mapBox);
      const refresh = async () => {
        try {
          const data = await api(`/api/my/orders/${order.id}/position`);
          update(data);
          meta.textContent = data.position
            ? `Автовоз в пути · скорость ${Math.round(data.position.speed)} км/ч · данные на ${new Date(data.position.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
            : 'Трекер пока не передал координаты. Обновим автоматически.';
        } catch (e) {
          if (e.status === 401) return location.reload();
          if (e.status === 409) return loadOrders(); // статус сменился — перерисуем список
          meta.textContent = `${e.message} Повторим через полминуты.`;
        }
      };
      refresh();
      timers.push(setInterval(refresh, REFRESH_MS));
    });
  } else if (order.status === 'transit') {
    card.append(h('p', { class: 'muted' }, 'Автовоз в пути. Положение на карте появится, когда диспетчер привяжет трекер.'));
  }
  return card;
}

openCabinet().catch((e) => { show('step-phone'); toast(e.message, true); });
