export default class Logger {
    constructor(selector, max = 50) {
        this.$logElem = document.querySelector(selector);
        this.logArr = [];
        this.max = max; // храним последние max строк (кольцевой буфер)
    }

    addLine(message) {
        const time = new Date().toLocaleTimeString();
        this.logArr.push(`${time}  ${message}`);

        // не обнуляем весь лог, а выкидываем самую старую строку
        if (this.logArr.length > this.max) this.logArr.shift();

        this.render();
    }

    render() {
        this.$logElem.value = this.logArr
            .map((line, index) => {
                const lineN = (index + 1).toString().padStart(2, '0');
                return `${lineN}: ${line}`;
            })
            .join('\n');

        // автопрокрутка к последней строке
        this.$logElem.scrollTop = this.$logElem.scrollHeight;
    }
}
