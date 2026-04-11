"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorkerCluster = void 0;
const cluster_1 = __importDefault(require("cluster"));
const workerManager_1 = require("./workerManager");
const startWorkerCluster = () => {
    if (cluster_1.default.isPrimary) {
        const workers = (0, workerManager_1.getWorkerCount)();
        console.log("🚀 Starting worker cluster:", workers);
        for (let i = 0; i < workers; i++) {
            cluster_1.default.fork();
        }
        cluster_1.default.on("exit", () => {
            cluster_1.default.fork();
        });
    }
    else {
        console.log("👷 Worker started", process.pid);
        require("./ai.partition.worker");
        require("./followup.worker");
    }
};
exports.startWorkerCluster = startWorkerCluster;
