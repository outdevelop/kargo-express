import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'app.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name  TEXT NOT NULL DEFAULT '',
    client_phone TEXT NOT NULL,
    from_city    TEXT NOT NULL,
    to_city      TEXT NOT NULL,
    cars         TEXT NOT NULL DEFAULT '',
    cars_count   INTEGER NOT NULL DEFAULT 1,
    status       TEXT NOT NULL DEFAULT 'new',
    tracker_id   TEXT NOT NULL DEFAULT '',
    eta          TEXT NOT NULL DEFAULT '',
    comment      TEXT NOT NULL DEFAULT '',
    source       TEXT NOT NULL DEFAULT 'admin',
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS orders_phone ON orders (client_phone);

  CREATE TABLE IF NOT EXISTS sessions (
    token   TEXT PRIMARY KEY,
    role    TEXT NOT NULL,
    phone   TEXT NOT NULL DEFAULT '',
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS login_codes (
    phone    TEXT PRIMARY KEY,
    code     TEXT NOT NULL,
    expires  INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at  INTEGER NOT NULL
  );
`);

export const STATUSES = {
  new: 'Новая',
  confirmed: 'Подтверждена',
  loading: 'Погрузка',
  transit: 'В пути',
  delivered: 'Доставлена',
  cancelled: 'Отменена',
};

export const orderNumber = (id) => `КЭ-${String(id).padStart(4, '0')}`;

/** Приводит телефон к виду +7XXXXXXXXXX; возвращает null, если номер не российский мобильный/городской. */
export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) digits = digits.slice(1);
  return digits.length === 10 ? `+7${digits}` : null;
}
