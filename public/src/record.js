import CameraScreenshotController from './screenshot.js';
import Logger from './logger.js';
import {
    API as api,
    INTERVAL,
    QUALITY,
    QUALITY_WIDTH,
    QUALITY_HEIGHT,
    PHOTO_MODE,
    UPLOAD_TIMEOUT,
    fetchWithTimeout
} from './config.js';

const canvas = document.getElementById('rec-show');
const select = document.getElementById('rec-dev-select');
const btn = document.getElementById('rec-share');

const logger = new Logger("#txt-logs");
const camera = new CameraScreenshotController(canvas, logger);

// Очистка старого ID комнаты
localStorage.clear();

logger.addLine(`Используется: ${api}`);

if ('wakeLock' in navigator) {
    logger.addLine('Wake Lock API поддерживается');
} else {
    logger.addLine('Wake Lock API НЕ поддерживается');
}

let wakeLock = null;

async function enableWakeLock() {
    if (!('wakeLock' in navigator)) {
        logger.addLine('Wake Lock API недоступен в этом браузере');
        return;
    }

    try {
        wakeLock = await navigator.wakeLock.request('screen');
        logger.addLine('Wake Lock успешно получен');

        wakeLock.addEventListener('release', () => {
            logger.addLine('Wake Lock был освобождён браузером');
        });
    } catch (e) {
        logger.addLine(`Wake Lock ошибка: ${e.name}`);
    }
}

function disableWakeLock() {
    wakeLock?.release();
    wakeLock = null;
    logger.addLine('Wake Lock выключен');
}

document.addEventListener('visibilitychange', () => {
    logger.addLine(`Visibility: ${document.visibilityState}`);
    
    if (
        document.visibilityState === 'visible' &&
        !screenshotsIsStopped &&
        !wakeLock
    ) {
        enableWakeLock();
    }
});

// загрузка устройств
camera.initDevices().then(devices => {
    devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || 'Камера';
        select.appendChild(opt);
    });
});

// выбор камеры
select.addEventListener('change', e => {
    if (e.target.value) {
        camera.selectedDevice = e.target.value;
        btn.removeAttribute('disabled');
        logger.addLine(`Выбрано устройство: ${e.target.value}`);
    }
});

// Вешаем события
const $roomLink = document.querySelector('#share-link');

function selectAllIfNotEmpty() {
    if (!$roomLink.value) return;

    // небольшой таймаут — важно для mobile (iOS / Android)
    setTimeout(() => {
        $roomLink.focus();
        $roomLink.select();
    }, 100);
}

$roomLink.addEventListener('click', selectAllIfNotEmpty);
$roomLink.addEventListener('touchend', selectAllIfNotEmpty);

let screenshotsIsRunning = false;
let screenshotsIsStopped = true;

async function screenshotLoop() {
    if (screenshotsIsStopped) return;
    if (screenshotsIsRunning) return;

    screenshotsIsRunning = true;

    try {
        const roomId = localStorage.getItem('roomId');
        
        if (!roomId) {
            logger.addLine('Комната не создана');
            return;
        }

        const { blob, width, height, mode } = await camera.capture({
            quality: QUALITY,
        });

        const form = new FormData();
        form.append('file', blob, 'screenshot.jpg');
        form.append('roomId', roomId);

        const res = await fetchWithTimeout(
            `${api}/screenshot`,
            {
                method: 'POST',
                body: form
            },
            UPLOAD_TIMEOUT
        );

        const json = await res.json();
        logger.addLine(
            `${mode === 'photo' ? '📷' : '🎞'} ${width}×${height}, ${(blob.size / 1024).toFixed(1)} KB → ${json.id}`
        );
    } catch (err) {
        if (err.name === 'AbortError') {
            logger.addLine('Скрин: запрос прерван по таймауту');
        } else {
            logger.addLine(`Ошибка скрина: ${err.message}`);
        }
    } finally {
        screenshotsIsRunning = false;
        setTimeout(screenshotLoop, INTERVAL);
    }
}

// кнопка "создания комнаты"
btn.addEventListener('click', async ({ target }) => {

    if(!camera.selectedDevice) {
        return;
    }

    screenshotsIsStopped = !screenshotsIsStopped;

    // Скриншоты остановлены
    if(screenshotsIsStopped) {
        target.textContent = "Продолжить";
        disableWakeLock();              // ⬅️ ВАЖНО
        camera.close();                 // отпускаем камеру
    }
    // Продолжение скриншотов
    else{
        target.disabled = true;
        try {
            // Открываем камеру один раз и держим тёплой (нужно для takePhoto)
            await camera.open({
                width: QUALITY_WIDTH,
                height: QUALITY_HEIGHT,
                photo: PHOTO_MODE,
            });
        } catch (e) {
            logger.addLine(`Не удалось открыть камеру: ${e.name}`);
            screenshotsIsStopped = true;
            target.disabled = false;
            return;
        }
        target.disabled = false;
        target.textContent = "Остановить";

        // Не спамить комнатами
        if(!localStorage.getItem('roomId')){
            await createRoom();
        }

        await enableWakeLock();         // ⬅️ ВАЖНО
        screenshotLoop();
    }
});

async function createRoom(){
    const res = await fetch(`${api}/create-room`, { method: 'POST' });
    const { roomId } = await res.json();

    // Сохраняем ID комнаты
    localStorage.setItem('roomId', roomId);

    $roomLink.value =
        `${location.protocol}//${location.host}/preview.html?roomId=${roomId}`;

    logger.addLine(`Комната создана, ID: ${roomId}`);
}