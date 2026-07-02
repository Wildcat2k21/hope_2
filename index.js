import express from 'express';
import multer from 'multer';
import path from 'path';
import https from 'https'
import { nanoid } from 'nanoid';
import { RoomManager } from './modules/RoomManager.js'; // импортируем класс
import { RoomWatchers } from './modules/RoomWatchers.js';
import fs from 'fs';
import 'dotenv/config';

const app = express();
const SERVER_PORT = process.env.SERVER_PORT ?? 3000;
const SERVER_ADDR = process.env.SERVER_ADDR;
const PROTOCOL = process.env.PROTOCOL;
const PUBLIC_URL = `${PROTOCOL}://${SERVER_ADDR}:${SERVER_PORT}`;
const DEF_FILE_NAME = process.env.DEF_FILENAME ?? 'main';

// Сколько держим «висящий» long-poll запрос зрителя до ответа 304.
// Должно быть меньше клиентского таймаута запроса (см. config.js).
const HOLD_MS = 25000;

// ------------------
// HTTPS
const httpsOptions = {
    key: fs.readFileSync('./cert/key.pem'),
    cert: fs.readFileSync('./cert/cert.pem'),
};

// ------------------
// RoomManager + реестр ожидающих long-poll зрителей
const rooms = new RoomManager('./screenshots');
const watchers = new RoomWatchers();

// ------------------
// Multer (для загрузки скриншотов)
// Пока сохраняем временно в base папку, позже можно в папку комнаты
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, rooms.baseDir); // потом заменим на rooms.getRoomPath(roomId)
    },
    filename: (req, file, cb) => {
        const id = nanoid();
        cb(null, `${id}.jpg`);
        req.fileId = id;
    }
});
const upload = multer({ storage });

// ------------------
// Статика
app.use(express.static('./public'));

// ------------------
// POST /create-room
// Создаёт новую комнату и возвращает её ID
app.post('/create-room', (req, res) => {
    const roomId = rooms.createRoom();
    res.json({ roomId });
});

// POST /screenshot
// body: FormData { file: Blob }
app.post('/screenshot', upload.single('file'), (req, res) => {
    const roomId = req.body.roomId;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!roomId || !rooms.roomExists(roomId)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Room not found' });
    }

    // Сохраняем кадр (rename + очистка старых) и будим ожидающих зрителей
    const imgName = rooms.saveScreenshot(roomId, req.file.path);
    watchers.notify(roomId);

    res.json({ id: imgName, roomId });
});


// ------------------
/// GET /screen/:roomId
// Long-poll: если у зрителя уже актуальный кадр (или кадра ещё нет),
// запрос «висит» до появления нового кадра или таймаута HOLD_MS → 304.
app.get('/screen/:roomId', (req, res) => {
    const { roomId } = req.params;

    if (!rooms.roomExists(roomId)) {
        return res.status(404).json({ error: 'Room not found' });
    }

    const clientETag = req.headers['if-none-match'];

    // Пытаемся отдать кадр прямо сейчас. true — ответ отправлен.
    const trySend = () => {
        const latest = rooms.getLatest(roomId);
        if (!latest) return false; // кадра ещё нет — ждём

        const currentETag = `"${latest.filename}"`;
        if (clientETag === currentETag) return false; // не изменилось — ждём

        res.setHeader('ETag', currentETag);
        res.setHeader('Cache-Control', 'no-cache'); // важно для браузеров
        res.sendFile(path.resolve(latest.path));
        return true;
    };

    if (trySend()) return;

    // Нечего отдать сейчас → встаём в очередь ожидания нового кадра
    let finished = false;

    const cleanup = () => {
        clearTimeout(timer);
        unsubscribe();
    };

    const unsubscribe = watchers.wait(roomId, () => {
        if (finished) return;
        if (trySend()) {
            finished = true;
            cleanup();
        }
    });

    const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        cleanup();
        res.status(304).end();
    }, HOLD_MS);

    // Зритель ушёл/перезагрузился — снимаем с ожидания
    res.on('close', () => {
        if (finished) return;
        finished = true;
        cleanup();
    });
});


// ------------------
// 404
app.use((req, res) => res.status(404).send('Not Found'));

// ------------------
https.createServer(httpsOptions, app).listen(
    SERVER_PORT,
    '0.0.0.0', 
    () => {
        // console.clear();
        console.log(`Сервер запущен: ${PUBLIC_URL}`)
    }
);
