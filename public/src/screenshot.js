export default class CameraScreenshotController {
    constructor(canvas, logger) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.video = document.createElement('video');
        this.video.playsInline = true;
        this.video.muted = true;
        this.stream = null;
        this.selectedDevice = null;

        this.logger = logger;
    }

    async initDevices() {
        await navigator.mediaDevices.getUserMedia({ video: true });

        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'videoinput');
    }

    async makeScreenshot({
        quality = 0.8,
        width = 1280,
        height = 960
    } = {}) {
        try {
            // 1. Открываем камеру. width/height — это ideal-констрейнты:
            //    камера отдаёт ближайший поддерживаемый режим. Снизив их в .env,
            //    можно осознанно уменьшить разрешение ради трафика.
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: this.selectedDevice ? { exact: this.selectedDevice } : undefined,
                    width: { ideal: width },
                    height: { ideal: height }
                }
            });

            this.video.srcObject = this.stream;
            await this.video.play();

            // 2. Ждём реальный кадр (ВАЖНО для Android)
            await new Promise(resolve => {
                if (this.video.videoWidth) return resolve();
                this.video.onloadedmetadata = () => resolve();
            });

            // 3. Канвас точно под нативный кадр камеры → отрисовка 1:1.
            //    Нет масштабирования (нет интерполяции) и нет обрезки кадра.
            //    Единственная управляемая потеря качества — JPEG quality ниже.
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            this.ctx.drawImage(this.video, 0, 0);

            // 4. Конвертируем в Blob
            const blob = await new Promise(resolve =>
                this.canvas.toBlob(resolve, 'image/jpeg', quality)
            );

            return blob;
        } finally {
            // 5. ВСЕГДА выключаем камеру
            this.stop();
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    }
}
