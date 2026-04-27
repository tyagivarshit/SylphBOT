"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeAutomationWorker = exports.initAutomationWorker = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("../queues/queue.defaults");
const commentAutomation_service_1 = require("../services/commentAutomation.service");
const logger_1 = __importDefault(require("../utils/logger"));
const sentry_1 = require("../observability/sentry");
const requestContext_1 = require("../observability/requestContext");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
const runtimePolicy_service_1 = require("../services/runtimePolicy.service");
const shouldRunWorker = process.env.RUN_WORKER === "true" ||
    process.env.RUN_WORKER === undefined;
const globalForAutomationWorker = globalThis;
const initAutomationWorker = () => {
    (0, sentry_1.initializeSentry)();
    if (!shouldRunWorker) {
        console.log("[automation.worker] RUN_WORKER disabled, worker not started");
        return null;
    }
    if (globalForAutomationWorker.__sylphAutomationWorker) {
        return globalForAutomationWorker.__sylphAutomationWorker;
    }
    const worker = new bullmq_1.Worker("automation", (0, queue_defaults_1.withRedisWorkerFailSafe)("automation", async (job) => (0, requestContext_1.runWithRequestContext)({
        requestId: String(job.id || `${job.queueName}:${job.name}`),
        source: "worker",
        route: `queue:${job.queueName}`,
        queueName: job.queueName,
        jobId: String(job.id || `${job.queueName}:${job.name}`),
        leadId: job.data?.leadId || null,
        businessId: job.data?.businessId || null,
    }, async () => {
        const subscriptionAccess = await (0, subscriptionGuard_middleware_1.getSubscriptionAccess)(job.data?.businessId || "").catch(() => null);
        if (!subscriptionAccess?.allowed) {
            (0, subscriptionGuard_middleware_1.logSubscriptionLockedAction)({
                businessId: job.data?.businessId || null,
                queueName: job.queueName,
                jobId: job.id,
                leadId: job.data?.leadId || null,
                action: "automation_worker_job",
                lockReason: subscriptionAccess?.lockReason,
            }, "Automation worker skipped job because subscription is locked");
            return;
        }
        logger_1.default.info({
            jobId: job.id,
            queueName: job.queueName,
            leadId: job.data?.leadId || null,
            businessId: job.data?.businessId || null,
            jobName: job.name,
        }, "Automation worker job started");
        if (job.name === "comment" || job.name === "comment-reply") {
            (0, runtimePolicy_service_1.assertPhase5APreviewBypassEnabled)("comment_automation_worker");
            console.log("Processing comment reply job", job.data);
            await (0, commentAutomation_service_1.handleCommentAutomation)(job.data);
        }
        else {
            throw new Error(`unsupported_automation_job:${String(job.name || "unknown")}`);
        }
        logger_1.default.info({
            jobId: job.id,
            queueName: job.queueName,
            leadId: job.data?.leadId || null,
            businessId: job.data?.businessId || null,
            jobName: job.name,
        }, "Automation worker job completed");
    })), {
        connection: (0, redis_1.getWorkerRedisConnection)(),
        concurrency: 20,
    });
    worker.on("failed", (job, error) => {
        logger_1.default.error({
            jobId: job?.id,
            queueName: job?.queueName || "automation",
            leadId: job?.data?.leadId || null,
            businessId: job?.data?.businessId || null,
            error,
        }, "Automation worker job failed");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                worker: "automation",
                queueName: job?.queueName || "automation",
            },
            extras: {
                jobId: job?.id,
                leadId: job?.data?.leadId || null,
                businessId: job?.data?.businessId || null,
            },
        });
    });
    worker.on("error", (error) => {
        logger_1.default.error({
            queueName: "automation",
            error,
        }, "Automation worker error");
        (0, sentry_1.captureExceptionWithContext)(error, {
            tags: {
                worker: "automation",
                queueName: "automation",
            },
        });
    });
    logger_1.default.info({ queueName: "automation" }, "Automation worker started");
    globalForAutomationWorker.__sylphAutomationWorker = worker;
    return worker;
};
exports.initAutomationWorker = initAutomationWorker;
const closeAutomationWorker = async () => {
    await globalForAutomationWorker.__sylphAutomationWorker?.close().catch(() => undefined);
    globalForAutomationWorker.__sylphAutomationWorker = undefined;
};
exports.closeAutomationWorker = closeAutomationWorker;
