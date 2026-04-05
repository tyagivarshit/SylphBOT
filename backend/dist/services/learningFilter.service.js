"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldLearn = void 0;
const shouldLearn = (input, output) => {
    const text = (input + " " + output).toLowerCase();
    /* ❌ skip useless */
    if (text.length < 20)
        return false;
    if (text.includes("no information available"))
        return false;
    if (text.includes("sorry"))
        return false;
    /* ❌ skip greetings */
    if (/hi|hello|hey/.test(text))
        return false;
    return true;
};
exports.shouldLearn = shouldLearn;
