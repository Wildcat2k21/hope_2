export default class CameraScreenshotController {
    constructor(canvas, logger) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;

        this.stream = null;
        this.track = null;
        this.imageCapture = null;   // фото-режим (полное разрешение сенсора)
        this.photoW = null;
        this.photoH = null;

        this.selectedDevice = null;
        this.logger = logger;
    }

    async initDevices() {
        // временный поток только чтобы получить labels, сразу закрываем
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        s.getTracks().forEach(t => t.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'videoinput');
    }

    // Открываем камеру ОДИН раз и держим поток живым: тёплая камера →
    // надёжный и быстрый takePhoto, без переоткрытия на каждый кадр.
    // photo=true — пробуем включить фото-режим максимального разрешения.
    async open({ width = 1280, height = 960, photo = true } = {}) {
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: this.selectedDevice ? { exact: this.selectedDevice } : undefined,
                width: { ideal: width },
                height: { ideal: height }
            }
        });

        this.video.srcObject = this.stream;
        await this.video.play();

        // Ждём реальный кадр (ВАЖНО для Android)
        await new Promise(resolve => {
            if (this.video.videoWidth) return resolve();
            this.video.onloadedmetadata = () => resolve();
        });

        this.track = this.stream.getVideoTracks()[0];
        const vs = this.track.getSettings();
        this.logger?.addLine(`Камера: ${vs.width}×${vs.height} (видео-поток)`);

        // Пытаемся поднять фото-режим
        this.imageCapture = null;
        this.photoW = this.photoH = null;

        if (photo && typeof ImageCapture !== 'undefined') {
            try {
                const ic = new ImageCapture(this.track);
                const caps = await ic.getPhotoCapabilities();
                this.imageCapture = ic;
                this.photoW = caps?.imageWidth?.max ?? null;
                this.photoH = caps?.imageHeight?.max ?? null;
                this.logger?.addLine(
                    `Фото-режим ВКЛ: до ${this.photoW ?? '?'}×${this.photoH ?? '?'}`
                );
            } catch (e) {
                this.imageCapture = null;
                this.logger?.addLine(`Фото-режим недоступен (${e.name}), видео-режим`);
            }
        } else if (photo) {
            this.logger?.addLine('ImageCapture не поддерживается, видео-режим');
        } else {
            this.logger?.addLine('Фото-режим выключен настройкой, видео-режим');
        }
    }

    // Делает один снимок. Возвращает { blob, width, height, mode }.
    // Локальный превью (canvas) всегда обновляется из живого видео-кадра.
    async capture({ quality = 0.8 } = {}) {
        // 1. Обновляем превью оператора из текущего кадра (1:1, без интерполяции)
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        this.canvas.width = vw;
        this.canvas.height = vh;
        this.ctx.drawImage(this.video, 0, 0);

        // 2. Фото-режим: полный кадр сенсора, JPEG отдаёт сама камера как есть
        if (this.imageCapture) {
            try {
                const settings = {};
                if (this.photoW) settings.imageWidth = this.photoW;
                if (this.photoH) settings.imageHeight = this.photoH;

                const blob = await this.imageCapture.takePhoto(settings);
                const dim = await blobDimensions(blob);
                return { blob, width: dim.width, height: dim.height, mode: 'photo' };
            } catch (e) {
                // разовый сбой takePhoto — отдаём видео-кадр, камеру не роняем
                this.logger?.addLine(`takePhoto сбой (${e.name}), кадр из видео`);
            }
        }

        // 3. Видео-режим (фоллбэк): текущий кадр canvas + JPEG quality
        const blob = await new Promise(resolve =>
            this.canvas.toBlob(resolve, 'image/jpeg', quality)
        );
        return { blob, width: vw, height: vh, mode: 'video' };
    }

    close() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        this.track = null;
        this.imageCapture = null;
    }
}

// Размеры JPEG-блоба без вставки в DOM
async function blobDimensions(blob) {
    try {
        const bmp = await createImageBitmap(blob);
        const dim = { width: bmp.width, height: bmp.height };
        bmp.close();
        return dim;
    } catch {
        return { width: 0, height: 0 };
    }
}
