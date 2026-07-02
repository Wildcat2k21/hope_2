// preview.js
import Logger from './logger.js';
import { API, fetchWithTimeout } from './config.js';

const logger = new Logger('#txt-logs');

// --- roomId из query ---
const roomId = new URLSearchParams(location.search).get('roomId');

if (!roomId) {
    logger.addLine('Не указан roomId в query параметрах');
    throw new Error('Не указан roomId в query параметрах');
}

// --- Элементы ---
const canvas = document.getElementById('img-show');
const ctx = canvas.getContext('2d');
const $captureBtn = document.getElementById('capture-btn');
const $snapList = document.getElementById('snap-list');

// --- Состояние long-poll ---
let lastETag = null;          // текущая версия кадра ("abc.jpg")
let lastBlob = null;          // оригинальный JPEG последнего кадра (полное качество для захвата)
let stopped = false;
let isFetching = false;

// Клиентский таймаут запроса должен быть БОЛЬШЕ серверного удержания (HOLD_MS=25с),
// иначе мы будем рвать «висящий» запрос раньше, чем сервер ответит.
const REQUEST_TIMEOUT = 35000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- Отрисовка blob в canvas ---
function drawBlobToCanvas(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            // Канвас под натуральный размер кадра → чёткая отрисовка без
            // двойного масштабирования (на экран ужимает уже CSS, оригинал цел).
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve();
        };
        img.onerror = err => {
            URL.revokeObjectURL(url);
            reject(err);
        };
        img.src = url;
    });
}

// --- Один цикл long-poll ---
async function pullOnce() {
    if (isFetching || stopped) return;
    isFetching = true;

    try {
        const headers = {};
        if (lastETag) headers['If-None-Match'] = lastETag;

        const res = await fetchWithTimeout(
            `${API}/screen/${roomId}`,
            { method: 'GET', headers, cache: 'no-store' },
            REQUEST_TIMEOUT
        );

        if (res.status === 304) {
            // Сервер держал соединение, новых кадров нет — сразу пробуем снова
            return;
        }

        if (!res.ok) {
            logger.addLine(`Ошибка запроса: ${res.status} ${res.statusText}`);
            await sleep(1000);
            return;
        }

        const newETag = res.headers.get('ETag');
        const blob = await res.blob();

        lastBlob = blob;                 // сохраняем оригинал для захвата
        await drawBlobToCanvas(blob);
        lastETag = newETag || null;

        logger.addLine(
            `Кадр ${canvas.width}×${canvas.height}, ${(blob.size / 1024).toFixed(1)} KB`
        );
    } catch (err) {
        if (err.name === 'AbortError') {
            // сработал наш предохранительный таймаут — просто повторяем
        } else {
            logger.addLine(`Ошибка при pull: ${err.message}`);
            await sleep(1000);
        }
    } finally {
        isFetching = false;
    }
}

// --- Цикл опроса ---
async function pollLoop() {
    while (!stopped) {
        await pullOnce();
    }
}

// --- Захват кадра ---
// Берём ОРИГИНАЛЬНЫЙ последний JPEG (не отмасштабированный canvas),
// кэшируем его через object URL и кладём ссылку в список. Каждый захват —
// независимый «замороженный» blob: последующие кадры его не меняют.
let captureCount = 0;

function captureSnapshot() {
    if (!lastBlob) {
        logger.addLine('Нет кадра для захвата');
        return;
    }

    captureCount++;
    const url = URL.createObjectURL(lastBlob); // живёт, пока открыта вкладка
    const time = new Date().toLocaleTimeString();

    const li = document.createElement('li');
    li.className = 'snap-item';

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = `Захват #${captureCount} — ${time}`;

    li.appendChild(a);
    $snapList.prepend(li);

    logger.addLine(`Захват #${captureCount} сохранён`);
}

$captureBtn?.addEventListener('click', captureSnapshot);

// --- Старт ---
function startPolling() {
    if (!stopped && isFetching) return;
    stopped = false;
    pollLoop();
}

function stopPolling() {
    stopped = true;
}

startPolling();

export { startPolling, stopPolling, pullOnce, captureSnapshot };
