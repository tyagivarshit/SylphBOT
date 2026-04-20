"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const commentAutomation_service_1 = require("../services/commentAutomation.service");
const logger_1 = __importDefault(require("../utils/logger"));
const sentry_1 = require("../observability/sentry");
const requestContext_1 = require("../observability/requestContext");
const subscriptionGuard_middleware_1 = require("../middleware/subscriptionGuard.middleware");
(0, sentry_1.initializeSentry)();
if (process.env.RUN_WORKER === "true") {
    const worker = new bullmq_1.Worker("automation", async (job) => (0, requestContext_1.runWithRequestContext)({
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
        if (job.name === "comment") {
            await (0, commentAutomation_service_1.handleCommentAutomation)(job.data);
        }
        logger_1.default.info({
            jobId: job.id,
            queueName: job.queueName,
            leadId: job.data?.leadId || null,
            businessId: job.data?.businessId || null,
            jobName: job.name,
        }, "Automation worker job completed");
    }), {
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
}
