import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, STATUSES, orderNumber, normalizePhone } from './db.js';
import { sendCode, FLASHCALL_MODE } from './flashcall.js';
import { listTrackers, getPosition, cityCoords, GLONASS_MODE } from './glonass.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4173;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const BEHIND_PROXY = Boolean(process.env.TRUST_PROXY);

const SESSION_TTL = { admin: 12 * 3600e3, client: 30 * 24 * 3600e3 };
const CODE_TTL = 5 * 60e3;
const CODE_COOLDOWN = 60e3;
const CODE_MAX_ATTEMPTS = 5;

const app = express();
app.disable('x-powered-by');
if (BEHIND_PROXY) app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));

/* ---------- Вспомогательное ---------- */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const text = (value, max) => String(value ?? '').trim().slice(0, max);

// Простой ограничитель частоты в памяти: не больше limit событий за windowMs на ключ.
const hits = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) fail(429, 'Слишком много попыток. Подождите несколько минут.');
  recent.push(now);
  hits.set(key, recent);
}
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) if (times.every((t) => now - t > 3600e3)) hits.delete(key);
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
  db.prepare('DELETE FROM login_codes WHERE expires < ?').run(now);
}, 10 * 60e3).unref();

/* ---------- Сессии ---------- */

function readSession(req) {
  const token = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')?.[1];
  if (!token) return null;
  return db.prepare('SELECT * FROM sessions WHERE token = ? AND expires > ?').get(token, Date.now()) ?? null;
}
function startSession(res, role, phone = '') {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, role, phone, expires) VALUES (?, ?, ?, ?)')
    .run(token, role, phone, Date.now() + SESSION_TTL[role]);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: BEHIND_PROXY, maxAge: SESSION_TTL[role], path: '/' });
}
const need = (role) => (req, res, next) => {
  const session = readSession(req);
  if (session?.role !== role) return res.status(401).json({ error: 'Нужно войти' });
  req.session = session;
  next();
};

/* ---------- Заявки: общие функции ---------- */

function cleanOrder(body, { partial = false } = {}) {
  const out = {};
  const has = (key) => !partial || body[key] !== undefined;
  if (has('clientPhone')) out.client_phone = normalizePhone(body.clientPhone) ?? fail(400, 'Укажите телефон клиента: 10 цифр после +7');
  if (has('fromCity')) out.from_city = text(body.fromCity, 80) || fail(400, 'Укажите, откуда везём');
  if (has('toCity')) out.to_city = text(body.toCity, 80) || fail(400, 'Укажите, куда везём');
  if (has('clientName')) out.client_name = text(body.clientName, 120);
  if (has('cars')) out.cars = text(body.cars, 500);
  if (has('comment')) out.comment = text(body.comment, 1000);
  if (has('trackerId')) out.tracker_id = text(body.trackerId, 80);
  if (has('eta')) out.eta = /^\d{4}-\d{2}-\d{2}$/.test(body.eta ?? '') ? body.eta : '';
  if (has('carsCount')) {
    const count = Number(body.carsCount ?? 1);
    out.cars_count = Number.isInteger(count) && count >= 1 && count <= 99 ? count : fail(400, 'Количество машин — от 1 до 99');
  }
  if (has('status')) out.status = STATUSES[body.status ?? 'new'] ? (body.status ?? 'new') : fail(400, 'Неизвестный статус');
  return out;
}

const adminView = (o) => ({
  id: o.id, number: orderNumber(o.id), clientName: o.client_name, clientPhone: o.client_phone,
  fromCity: o.from_city, toCity: o.to_city, cars: o.cars, carsCount: o.cars_count,
  status: o.status, trackerId: o.tracker_id, eta: o.eta, comment: o.comment, source: o.source,
  createdAt: o.created_at, updatedAt: o.updated_at,
});
const clientView = (o) => ({
  id: o.id, number: orderNumber(o.id), fromCity: o.from_city, toCity: o.to_city,
  cars: o.cars, carsCount: o.cars_count, status: o.status, eta: o.eta, updatedAt: o.updated_at,
  tracking: o.status === 'transit' && Boolean(o.tracker_id),
});

async function positionFor(order) {
  const position = await getPosition(order.tracker_id, { from: order.from_city, to: order.to_city });
  return { position, route: { from: cityCoords(order.from_city), to: cityCoords(order.to_city) } };
}

/* ---------- Публичное: заявка с сайта ---------- */

app.post('/api/requests', (req, res) => {
  rateLimit(`request:${req.ip}`, 5, 10 * 60e3);
  const order = cleanOrder({
    clientPhone: req.body.phone, fromCity: req.body.from, toCity: req.body.to,
    cars: req.body.kind, carsCount: req.body.count, clientName: req.body.name,
  });
  const now = Date.now();
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO orders (client_name, client_phone, from_city, to_city, cars, cars_count, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'new', 'site', ?, ?)
  `).run(order.client_name, order.client_phone, order.from_city, order.to_city, order.cars, order.cars_count, now, now);
  res.status(201).json({ number: orderNumber(lastInsertRowid) });
});

/* ---------- Вход ---------- */

app.get('/api/me', (req, res) => {
  const session = readSession(req);
  res.json(session ? { role: session.role, phone: session.phone } : { role: null });
});

app.post('/api/auth/logout', (req, res) => {
  const session = readSession(req);
  if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(session.token);
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});

app.post('/api/auth/admin', (req, res) => {
  rateLimit(`admin:${req.ip}`, 8, 15 * 60e3);
  if (!ADMIN_PASSWORD) fail(503, 'Пароль администратора не задан: укажите ADMIN_PASSWORD в .env');
  const digest = (value) => crypto.createHash('sha256').update(String(value ?? '')).digest();
  if (!crypto.timingSafeEqual(digest(req.body.password), digest(ADMIN_PASSWORD))) fail(401, 'Неверный пароль');
  startSession(res, 'admin');
  res.json({ ok: true });
});

app.post('/api/auth/code', async (req, res) => {
  const phone = normalizePhone(req.body.phone) ?? fail(400, 'Введите номер полностью: 10 цифр после +7');
  rateLimit(`code-ip:${req.ip}`, 10, 15 * 60e3);
  const known = db.prepare('SELECT 1 FROM orders WHERE client_phone = ? LIMIT 1').get(phone);
  if (!known) fail(404, 'По этому номеру заявок нет. Проверьте номер или позвоните диспетчеру.');
  const last = db.prepare('SELECT sent_at FROM login_codes WHERE phone = ?').get(phone);
  if (last && Date.now() - last.sent_at < CODE_COOLDOWN) fail(429, 'Звонок уже отправлен. Повторить можно через минуту.');

  const code = await sendCode(phone);
  const now = Date.now();
  db.prepare(`
    INSERT INTO login_codes (phone, code, expires, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
    ON CONFLICT (phone) DO UPDATE SET code = excluded.code, expires = excluded.expires, attempts = 0, sent_at = excluded.sent_at
  `).run(phone, code, now + CODE_TTL, now);
  // В демо-режиме звонка нет, поэтому код отдаём странице. В боевом режиме код наружу не уходит.
  res.json({ ok: true, ...(FLASHCALL_MODE === 'mock' ? { demoCode: code } : {}) });
});

app.post('/api/auth/verify', (req, res) => {
  const phone = normalizePhone(req.body.phone) ?? fail(400, 'Неверный номер');
  const entry = db.prepare('SELECT * FROM login_codes WHERE phone = ?').get(phone);
  if (!entry || entry.expires < Date.now()) fail(400, 'Код устарел. Запросите звонок ещё раз.');
  if (entry.attempts >= CODE_MAX_ATTEMPTS) fail(429, 'Слишком много попыток. Запросите звонок ещё раз.');
  const given = String(req.body.code ?? '');
  if (!/^\d{4}$/.test(given) || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(entry.code))) {
    db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE phone = ?').run(phone);
    fail(400, 'Код не подошёл. Это последние 4 цифры номера, с которого вам позвонили.');
  }
  db.prepare('DELETE FROM login_codes WHERE phone = ?').run(phone);
  startSession(res, 'client', phone);
  res.json({ ok: true });
});

/* ---------- Личный кабинет клиента ---------- */

app.get('/api/my/orders', need('client'), (req, res) => {
  const rows = db.prepare("SELECT * FROM orders WHERE client_phone = ? AND status != 'cancelled' ORDER BY id DESC").all(req.session.phone);
  res.json({ orders: rows.map(clientView), statuses: STATUSES });
});

app.get('/api/my/orders/:id/position', need('client'), async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND client_phone = ?').get(Number(req.params.id), req.session.phone);
  if (!order) fail(404, 'Заявка не найдена');
  if (order.status !== 'transit' || !order.tracker_id) fail(409, 'Автовоз по этой заявке сейчас не в пути');
  res.json(await positionFor(order));
});

/* ---------- Админ-панель ---------- */

app.get('/api/admin/orders', need('admin'), async (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  let trackers = [];
  let trackersError = null;
  try { trackers = await listTrackers(); } catch (error) { trackersError = error.message; }
  res.json({ orders: rows.map(adminView), statuses: STATUSES, trackers, trackersError, modes: { glonass: GLONASS_MODE, flashcall: FLASHCALL_MODE } });
});

app.post('/api/admin/orders', need('admin'), (req, res) => {
  const o = cleanOrder(req.body);
  const now = Date.now();
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO orders (client_name, client_phone, from_city, to_city, cars, cars_count, status, tracker_id, eta, comment, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?)
  `).run(o.client_name, o.client_phone, o.from_city, o.to_city, o.cars, o.cars_count, o.status, o.tracker_id, o.eta, o.comment, now, now);
  res.status(201).json(adminView(db.prepare('SELECT * FROM orders WHERE id = ?').get(lastInsertRowid)));
});

app.patch('/api/admin/orders/:id', need('admin'), (req, res) => {
  const id = Number(req.params.id);
  const changes = cleanOrder(req.body, { partial: true });
  const keys = Object.keys(changes);
  if (!keys.length) fail(400, 'Нечего менять');
  const result = db.prepare(`UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => changes[k]), Date.now(), id);
  if (!result.changes) fail(404, 'Заявка не найдена');
  res.json(adminView(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)));
});

app.delete('/api/admin/orders/:id', need('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM orders WHERE id = ?').run(Number(req.params.id));
  if (!result.changes) fail(404, 'Заявка не найдена');
  res.json({ ok: true });
});

app.get('/api/admin/orders/:id/position', need('admin'), async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) fail(404, 'Заявка не найдена');
  if (!order.tracker_id) fail(409, 'К заявке не привязан автовоз');
  res.json(await positionFor(order));
});

/* ---------- Статика и ошибки ---------- */

app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));
app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules/leaflet/dist')));
app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }));

app.use((error, req, res, next) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный запрос' });
  console.error(error);
  res.status(500).json({ error: 'Что-то сломалось на сервере. Попробуйте ещё раз.' });
});

app.listen(PORT, () => {
  console.log(`Карго Экспресс: http://localhost:${PORT}  (вход по звонку: ${FLASHCALL_MODE}, ГЛОНАСС: ${GLONASS_MODE})`);
  if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD не задан — вход в админ-панель отключён.');
});
