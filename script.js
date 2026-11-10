// Контакты для заявок. TODO: заменить на настоящую почту компании.
const REQUEST_EMAIL = 'info@example.com';
const MAX_CARS = 8;

const form = document.getElementById('request-form');
const toInput = form.elements.to;
const fromInput = form.elements.from;
const countOut = document.getElementById('count');
const errorBox = document.getElementById('form-error');
let count = 1;

// Указатель: клик по городу подставляет его в «Куда»
document.querySelectorAll('.sign__row').forEach((row) => {
  row.addEventListener('click', () => {
    document.querySelectorAll('.sign__row.is-picked').forEach((r) => r.classList.remove('is-picked'));
    row.classList.add('is-picked');
    toInput.value = row.dataset.city;
    toInput.classList.remove('is-invalid');
    document.getElementById('request').scrollIntoView({ block: 'start' });
    form.elements.phone.focus({ preventScroll: true });
  });
});

document.getElementById('swap').addEventListener('click', () => {
  [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
});

// Счётчик машин
const stepButtons = form.querySelectorAll('[data-step]');
function renderCount() {
  countOut.textContent = count;
  stepButtons[0].disabled = count <= 1;
  stepButtons[1].disabled = count >= MAX_CARS;
}
stepButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    count = Math.min(MAX_CARS, Math.max(1, count + Number(btn.dataset.step)));
    renderCount();
  });
});
renderCount();

// Отправка: собираем письмо и открываем почтовую программу
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const required = [fromInput, toInput, form.elements.phone];
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
    `Телефон: ${form.elements.phone.value.trim()}`,
  ].join('\n');
  window.location.href = `mailto:${REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
form.addEventListener('input', (event) => event.target.classList.remove('is-invalid'));

// Мобильное меню
const burger = document.querySelector('.burger');
const nav = document.getElementById('nav');
function setMenu(open) {
  nav.classList.toggle('is-open', open);
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
}
burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
nav.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
