import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

export class RoomManager {
    constructor(baseDir = './screenshots') {
        this.baseDir = baseDir;
        if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir);
    }

    // Создать новую комнату и вернуть ID
    createRoom() {
        const roomId = nanoid();
        const roomPath = path.join(this.baseDir, roomId);
        fs.mkdirSync(roomPath);
        return roomId;
    }

    // Получить путь к папке комнаты
    getRoomPath(roomId) {
        return path.join(this.baseDir, roomId);
    }

    // Получить список файлов в комнате
    listFiles(roomId) {
        const roomPath = this.getRoomPath(roomId);
        if (!fs.existsSync(roomPath)) return [];
        return fs.readdirSync(roomPath);
    }

    // Сохранить новый скриншот в комнату.
    // Переименовывает временный файл внутрь комнаты и удаляет все старые.
    // В комнате всегда остаётся ровно один свежий .jpg. Возвращает его id.
    saveScreenshot(roomId, tempPath) {
        const roomPath = this.getRoomPath(roomId);
        const id = nanoid();
        const newName = `${id}.jpg`;
        const newPath = path.join(roomPath, newName);

        fs.renameSync(tempPath, newPath);

        for (const file of fs.readdirSync(roomPath)) {
            if (file === newName) continue;
            try {
                fs.unlinkSync(path.join(roomPath, file));
            } catch (e) {
                // файл могли удалить параллельно — это ок
            }
        }

        return id;
    }

    // Получить последний (единственный) кадр комнаты или null, если кадра ещё нет
    getLatest(roomId) {
        const roomPath = this.getRoomPath(roomId);
        if (!fs.existsSync(roomPath)) return null;

        const files = fs.readdirSync(roomPath);
        if (!files.length) return null;

        const filename = files[0];
        return { filename, path: path.join(roomPath, filename) };
    }

    // Удалить файл
    deleteFile(roomId, filename) {
        const filePath = path.join(this.getRoomPath(roomId), filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // Переименовать файл
    renameFile(roomId, oldName, newName) {
        const oldPath = path.join(this.getRoomPath(roomId), oldName);
        const newPath = path.join(this.getRoomPath(roomId), newName);
        if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
    }

    // Проверить, существует ли комната
    roomExists(roomId) {
        return fs.existsSync(this.getRoomPath(roomId));
    }
}
