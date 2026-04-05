"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkerCount = void 0;
const os_1 = __importDefault(require("os"));
const getWorkerCount = () => {
    const cpu = os_1.default.cpus().length;
    if (cpu <= 2)
        return 1;
    if (cpu <= 4)
        return 2;
    return cpu - 1;
};
exports.getWorkerCount = getWorkerCount;
