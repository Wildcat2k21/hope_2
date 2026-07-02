// Простой реестр ожидающих long-poll ответов по комнатам.
//
// Зритель, у которого уже есть актуальный кадр, не получает 304 сразу —
// его GET «висит», пока сюда не придёт уведомление о новом кадре (notify)
// или пока не сработает таймаут на стороне роутера. Это убирает задержку
// поллинга: зритель видит новый кадр почти сразу (≈ время одного RTT).
export class RoomWatchers {
    constructor() {
        this.map = new Map(); // roomId -> Set<callback>
    }

    // Подписаться на следующий кадр комнаты. Возвращает функцию отписки.
    wait(roomId, callback) {
        let set = this.map.get(roomId);
        if (!set) {
            set = new Set();
            this.map.set(roomId, set);
        }
        set.add(callback);

        return () => {
            set.delete(callback);
            if (set.size === 0) this.map.delete(roomId);
        };
    }

    // Разбудить всех ожидающих комнаты (новый кадр загружен).
    notify(roomId) {
        const set = this.map.get(roomId);
        if (!set) return;

        // Копируем, т.к. callback'и отписываются по ходу итерации.
        for (const cb of [...set]) cb();
    }
}
