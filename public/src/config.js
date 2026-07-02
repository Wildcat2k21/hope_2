// Общая конфигурация клиента, считанная из window.__CONFIG__,
// который собирается из .env при сборке (genpublic.sh).
const CONFIG = window.__CONFIG__ ?? {};

// Базовый адрес API: PROTOCOL://HOST[/PREFIX]
export const API = (
    `${CONFIG.PROTOCOL}://${CONFIG.SERVER_HOST}` +
    (CONFIG.API_PREFIX ? `/${CONFIG.API_PREFIX}` : '')
).replace(/\s+/g, '').trim();

// Числовые параметры с разумными значениями по умолчанию
export const INTERVAL = Number(CONFIG.INTERVAL) || 1000;
export const QUALITY = Number(CONFIG.QUALITY) || 0.8;
export const QUALITY_WIDTH = Number(CONFIG.QUALITY_WIDTH) || 1280;
export const QUALITY_HEIGHT = Number(CONFIG.QUALITY_HEIGHT) || 960;

// fetch с предохранительным таймаутом через AbortController
export function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(id));
}

export { CONFIG };
