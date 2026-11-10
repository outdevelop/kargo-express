// Куда уходят заявки. TODO: заменить на настоящую почту компании.
const REQUEST_EMAIL = 'info@example.com';
const MAX_CARS = 8;

/* ---------- Шапка и меню ---------- */

const header = document.getElementById('header');
const burger = document.querySelector('.burger');
const nav = document.getElementById('nav');

window.addEventListener('scroll', () => header.classList.toggle('is-scrolled', window.scrollY > 8), { passive: true });

function setMenu(open) {
  nav.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
}
burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
nav.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });

/* ---------- Вкладки услуг ---------- */

const tabs = [...document.querySelectorAll('.services__tabs [role="tab"]')];
function selectTab(tab, focus = false) {
  tabs.forEach((t) => {
    const active = t === tab;
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
  });
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    selectTab(tabs[(index + step + tabs.length) % tabs.length], true);
  });
});

/* ---------- Лента рейсов и просмотр фото ---------- */

const track = document.getElementById('trips-track');
const prev = document.getElementById('trips-prev');
const next = document.getElementById('trips-next');
const scrollStep = () => Math.max(320, track.clientWidth * 0.6);
prev.addEventListener('click', () => track.scrollBy({ left: -scrollStep(), behavior: 'smooth' }));
next.addEventListener('click', () => track.scrollBy({ left: scrollStep(), behavior: 'smooth' }));
function updateArrows() {
  prev.disabled = track.scrollLeft < 8;
  next.disabled = track.scrollLeft > track.scrollWidth - track.clientWidth - 8;
}
track.addEventListener('scroll', updateArrows, { passive: true });
updateArrows();

const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('img');
track.addEventListener('click', (event) => {
  const img = event.target.closest('.trip')?.querySelector('img');
  if (!img) return;
  lightboxImg.src = img.src;
  lightboxImg.alt = img.alt;
  lightbox.showModal();
});
lightbox.addEventListener('click', () => lightbox.close());

/* ---------- Форма заявки ---------- */

const form = document.getElementById('request-form');
const fromInput = form.elements.from;
const toInput = form.elements.to;
const phoneInput = form.elements.phone;
const countOut = document.getElementById('count');
const errorBox = document.getElementById('form-error');
const cityButtons = [...document.querySelectorAll('.cities button')];
let count = 1;

function markCity() {
  cityButtons.forEach((b) => b.classList.toggle('is-picked', b.dataset.city === toInput.value.trim()));
}
cityButtons.forEach((button) => {
  button.addEventListener('click', () => {
    toInput.value = button.dataset.city;
    toInput.classList.remove('is-invalid');
    markCity();
    phoneInput.focus();
  });
});
toInput.addEventListener('input', markCity);

document.getElementById('swap').addEventListener('click', () => {
  [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
  markCity();
});

const stepButtons = form.querySelectorAll('[data-step]');
function renderCount() {
  countOut.textContent = count;
  stepButtons[0].disabled = count <= 1;
  stepButtons[1].disabled = count >= MAX_CARS;
}
stepButtons.forEach((button) => {
  button.addEventListener('click', () => {
    count = Math.min(MAX_CARS, Math.max(1, count + Number(button.dataset.step)));
    renderCount();
  });
});
renderCount();

form.addEventListener('input', (event) => event.target.classList.remove('is-invalid'));
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const required = [fromInput, toInput, phoneInput];
  const empty = required.filter((input) => !input.value.trim());
  required.forEach((input) => input.classList.toggle('is-invalid', empty.includes(input)));
  if (empty.length) {
    errorBox.textContent = 'Заполните маршрут и телефон — без них не сможем рассчитать рейс.';
    errorBox.hidden = false;
    empty[0].focus();
    return;
  }
  errorBox.hidden = true;

  const subject = `Заявка на перевозку: ${fromInput.value.trim()} — ${toInput.value.trim()}`;
  const body = [
    `Откуда: ${fromInput.value.trim()}`,
    `Куда: ${toInput.value.trim()}`,
    `Что везём: ${form.elements.kind.value}`,
    `Количество автомобилей: ${count}`,
    `Телефон: ${phoneInput.value.trim()}`,
  ].join('\n');
  window.location.href = `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

/* ---------- Появление блоков при прокрутке ---------- */

// Без JS блоки видны сразу; скрываем их только здесь и показываем по положению на экране.
let pending = [...document.querySelectorAll('.reveal')];
document.documentElement.classList.add('js');
function reveal() {
  const limit = window.innerHeight * 0.92;
  pending = pending.filter((item) => {
    if (item.getBoundingClientRect().top > limit) return true;
    item.classList.add('is-visible');
    return false;
  });
  if (!pending.length) {
    window.removeEventListener('scroll', reveal);
    window.removeEventListener('resize', reveal);
  }
}
window.addEventListener('scroll', reveal, { passive: true });
window.addEventListener('resize', reveal);
reveal();
