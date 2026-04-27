"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAutomationFlow = exports.updateAutomationFlow = exports.getFlows = exports.createAutomationFlow = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const plan_config_1 = require("../config/plan.config");
class AutomationControllerError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = "AutomationControllerError";
        this.statusCode = statusCode;
    }
}
const allowedStepTypesByPlan = {
    LOCKED: [],
    FREE_LOCKED: [],
    BASIC: ["MESSAGE"],
    PRO: ["MESSAGE", "DELAY", "CONDITION"],
    ELITE: ["MESSAGE", "DELAY", "CONDITION", "BOOKING"],
};
const getRequestBusinessId = (req) => req.user?.businessId || null;
const getBusinessPlan = async (businessId) => prisma_1.default.subscription.findUnique({
    where: { businessId },
    include: {
        plan: {
            select: {
                name: true,
                type: true,
            },
        },
    },
});
const sanitizeSteps = (steps) => steps.map((step, index) => ({
    stepKey: `STEP_${index + 1}`,
    stepType: String(step.type || "").trim().toUpperCase(),
    message: typeof step.config?.message === "string" && step.config.message.trim()
        ? step.config.message.trim()
        : null,
    condition: typeof step.config?.condition === "string" && step.config.condition.trim()
        ? step.config.condition.trim()
        : null,
    nextStep: index < steps.length - 1 ? `STEP_${index + 2}` : null,
    metadata: (step.config || {}),
}));
const validateFlowPayload = async (businessId, payload) => {
    const subscription = await getBusinessPlan(businessId);
    const planKey = (0, plan_config_1.getPlanKey)(subscription?.plan || null);
    const name = String(payload.name || "").trim();
    const triggerValue = String(payload.triggerValue || "").trim().toLowerCase();
    const triggerType = String(payload.triggerType || "KEYWORD").trim().toUpperCase();
    const channel = String(payload.channel || "INSTAGRAM").trim().toUpperCase();
    const steps = Array.isArray(payload.steps) ? sanitizeSteps(payload.steps) : [];
    const status = String(payload.status || "ACTIVE").trim().toUpperCase();
    if (!name || !triggerValue) {
        throw new AutomationControllerError("Name and triggerValue are required", 400);
    }
    if (!steps.length) {
        throw new AutomationControllerError("At least 1 step is required", 400);
    }
    const allowedStepTypes = allowedStepTypesByPlan[planKey];
    const invalidStep = steps.find((step) => !allowedStepTypes.includes(step.stepType));
    if (invalidStep) {
        throw new AutomationControllerError(`Step '${invalidStep.stepType}' not allowed in ${planKey} plan`, 403);
    }
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
        throw new AutomationControllerError("Invalid status", 400);
    }
    return {
        businessId,
        name,
        triggerValue,
        triggerType,
        channel,
        status,
        steps,
    };
};
const getScopedFlow = async (businessId, flowId) => prisma_1.default.automationFlow.findFirst({
    where: {
        id: flowId,
        businessId,
    },
    include: {
        steps: {
            orderBy: { createdAt: "asc" },
        },
    },
});
/* ---------------- CREATE FLOW ---------------- */
const createAutomationFlow = async (req, res) => {
    try {
        const businessId = getRequestBusinessId(req);
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        const flowInput = await validateFlowPayload(businessId, req.body);
        const flow = await prisma_1.default.$transaction(async (tx) => {
            const createdFlow = await tx.automationFlow.create({
                data: {
                    businessId: flowInput.businessId,
                    name: flowInput.name,
                    channel: flowInput.channel,
                    triggerType: flowInput.triggerType,
                    triggerValue: flowInput.triggerValue,
                    status: flowInput.status,
                },
                select: { id: true },
            });
            await tx.automationStep.createMany({
                data: flowInput.steps.map((step) => ({
                    ...step,
                    flowId: createdFlow.id,
                })),
            });
            return tx.automationFlow.findFirst({
                where: {
                    id: createdFlow.id,
                    businessId: flowInput.businessId,
                },
                include: {
                    steps: {
                        orderBy: { createdAt: "asc" },
                    },
                },
            });
        });
        return res.status(201).json({
            success: true,
            data: {
                flow,
            },
        });
    }
    catch (error) {
        console.error("Create flow error:", error);
        return res.status(error instanceof AutomationControllerError ? error.statusCode : 500).json({
            success: false,
            data: null,
            message: error instanceof Error ? error.message : "Failed to create flow",
        });
    }
};
exports.createAutomationFlow = createAutomationFlow;
/* ---------------- GET FLOWS ---------------- */
const getFlows = async (req, res) => {
    try {
        const businessId = getRequestBusinessId(req);
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        const flows = await prisma_1.default.automationFlow.findMany({
            where: {
                businessId,
            },
            select: {
                id: true,
                name: true,
                channel: true,
                triggerType: true,
                triggerValue: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                steps: {
                    select: {
                        stepKey: true,
                        stepType: true,
                        message: true,
                        condition: true,
                        nextStep: true,
                        metadata: true,
                    },
                    orderBy: { createdAt: "asc" },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return res.json({
            success: true,
            data: flows,
        });
    }
    catch (error) {
        console.error("Fetch flows error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Failed to fetch flows",
        });
    }
};
exports.getFlows = getFlows;
/* ---------------- UPDATE FLOW ---------------- */
const updateAutomationFlow = async (req, res) => {
    try {
        const businessId = getRequestBusinessId(req);
        const flowId = String(req.params.id || "").trim();
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        if (!flowId) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "Flow id is required",
            });
        }
        const existingFlow = await getScopedFlow(businessId, flowId);
        if (!existingFlow) {
            return res.status(404).json({
                success: false,
                data: null,
                message: "Flow not found",
            });
        }
        const flowInput = await validateFlowPayload(businessId, req.body);
        const updatedFlow = await prisma_1.default.$transaction(async (tx) => {
            await tx.automationFlow.updateMany({
                where: {
                    id: existingFlow.id,
                    businessId,
                },
                data: {
                    name: flowInput.name,
                    channel: flowInput.channel,
                    triggerType: flowInput.triggerType,
                    triggerValue: flowInput.triggerValue,
                    status: flowInput.status,
                },
            });
            await tx.automationStep.deleteMany({
                where: {
                    flowId: existingFlow.id,
                    flow: {
                        businessId,
                    },
                },
            });
            await tx.automationStep.createMany({
                data: flowInput.steps.map((step) => ({
                    ...step,
                    flowId: existingFlow.id,
                })),
            });
            return tx.automationFlow.findFirst({
                where: {
                    id: existingFlow.id,
                    businessId,
                },
                include: {
                    steps: {
                        orderBy: {
                            createdAt: "asc",
                        },
                    },
                },
            });
        });
        return res.json({
            success: true,
            data: {
                flow: updatedFlow,
            },
        });
    }
    catch (error) {
        console.error("Update flow error:", error);
        return res.status(error instanceof AutomationControllerError ? error.statusCode : 500).json({
            success: false,
            data: null,
            message: error instanceof Error ? error.message : "Failed to update flow",
        });
    }
};
exports.updateAutomationFlow = updateAutomationFlow;
/* ---------------- DELETE FLOW ---------------- */
const deleteAutomationFlow = async (req, res) => {
    try {
        const businessId = getRequestBusinessId(req);
        const flowId = String(req.params.id || "").trim();
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        if (!flowId) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "Flow id is required",
            });
        }
        const existingFlow = await getScopedFlow(businessId, flowId);
        if (!existingFlow) {
            return res.status(404).json({
                success: false,
                data: null,
                message: "Flow not found",
            });
        }
        await prisma_1.default.$transaction(async (tx) => {
            await tx.automationExecution.deleteMany({
                where: {
                    flowId: existingFlow.id,
                    flow: {
                        businessId,
                    },
                },
            });
            await tx.automationStep.deleteMany({
                where: {
                    flowId: existingFlow.id,
                    flow: {
                        businessId,
                    },
                },
            });
            await tx.automationFlow.deleteMany({
                where: {
                    id: existingFlow.id,
                    businessId,
                },
            });
        });
        return res.json({
            success: true,
            data: {
                id: existingFlow.id,
            },
        });
    }
    catch (error) {
        console.error("Delete flow error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Failed to delete flow",
        });
    }
};
exports.deleteAutomationFlow = deleteAutomationFlow;
