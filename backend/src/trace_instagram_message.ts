import { ObjectId } from "mongodb";
import crypto from "crypto";
import prisma from "./config/prisma";
import { initReceptionRuntimeQueues } from "./queues/receptionRuntime.queue";
import { resolveOrCreateReceptionLead } from "./services/receptionLead.service";
import { receiveInboundInteraction } from "./services/receptionIntake.service";
import { __receptionRuntimeWorkerTestInternals } from "./workers/receptionRuntime.worker";
import { resolveFreshReceptionExecutionGate } from "./services/receptionContext.service";

async function run() {
  console.log("=== STARTING INSTAGRAM REPLY PIPELINE TRACE ===");

  // 1. Mock the queue registry to bypass Redis BullMQ operations
  console.log("Mocking reception runtime queue registry...");
  const registry = initReceptionRuntimeQueues();
  let wasRevenueBrainBridgeEnqueued = false;

  for (const key of Object.keys(registry)) {
    const queue = (registry as any)[key];
    if (queue) {
      queue.add = async (name: string, data: any, opts?: any) => {
        console.log(`[MOCK QUEUE] Intercepted add on queue [${key}]: name=${name}, interactionId=${data?.interactionId}`);
        if (key === "revenueBridge") {
          wasRevenueBrainBridgeEnqueued = true;
        }
        return { id: `mock_job_${crypto.randomBytes(3).toString("hex")}` } as any;
      };
    }
  }

  // 2. Seed Business, Client and SubscriptionLedger
  const businessId = new ObjectId().toString();
  const clientId = new ObjectId().toString();
  const pageId = `page_ig_trace_${crypto.randomBytes(3).toString("hex")}`;
  const phoneNumberId = `phone_ig_trace_${crypto.randomBytes(3).toString("hex")}`;
  const senderId = `sender_ig_trace_${crypto.randomBytes(3).toString("hex")}`;
  const messageId = `mid_ig_trace_${crypto.randomBytes(4).toString("hex")}`;
  const messageText = "Can you share pricing and package options?";

  console.log(`Seeding temporary Business: id=${businessId}`);
  await prisma.business.create({
    data: {
      id: businessId,
      ownerId: new ObjectId().toString(),
      name: "Pipeline Trace Test Business",
    },
  });

  console.log(`Seeding temporary Client: id=${clientId}, platform=INSTAGRAM, pageId=${pageId}`);
  await prisma.client.create({
    data: {
      id: clientId,
      businessId,
      platform: "INSTAGRAM",
      pageId,
      phoneNumberId, // unique phone identifier
      accessToken: "dummy_encrypted_token_here",
    },
  });

  console.log(`Seeding temporary SubscriptionLedger: businessId=${businessId}`);
  await prisma.subscriptionLedger.create({
    data: {
      businessId,
      subscriptionKey: `sub_ig_trace_${crypto.randomBytes(4).toString("hex")}`,
      status: "ACTIVE",
      planCode: "PRO",
      billingCycle: "monthly",
      currency: "USD",
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year out
    },
  });

  let createdInteractionId: string | null = null;

  try {
    // ----------------------------------------------------
    // STAGE 1 - WEBHOOK
    // ----------------------------------------------------
    console.log("\n[STAGE 1 - WEBHOOK RECEIVED]");
    console.log(`Mock Payload Details:`);
    console.log(`  Sender ID: ${senderId}`);
    console.log(`  Page ID: ${pageId}`);
    console.log(`  Message ID: ${messageId}`);
    console.log(`  Message Text: "${messageText}"`);

    // Verify Business Resolution
    const client = await prisma.client.findFirst({
      where: {
        pageId,
        isActive: true,
      },
    });
    console.log(`Resolved Business ID: ${client?.businessId || "FAILED"}`);

    // Call resolveOrCreateReceptionLead
    const lead = await resolveOrCreateReceptionLead({
      businessId,
      clientId,
      adapter: "INSTAGRAM",
      payload: {
        message: messageText,
        mid: messageId,
        from: { id: senderId },
        threadId: pageId,
        receivedAt: new Date().toISOString(),
      },
    });
    console.log(`Resolved / Created Lead ID: ${lead.id}`);

    // Call receiveInboundInteraction (Creates RECEIVED interaction)
    const { interaction, created } = await receiveInboundInteraction({
      businessId,
      clientId,
      leadId: lead.id,
      adapter: "INSTAGRAM",
      correlationId: `corr_${messageId}`,
      traceId: `trace_${messageId}`,
      payload: {
        message: messageText,
        mid: messageId,
        from: { id: senderId },
        threadId: pageId,
        receivedAt: new Date().toISOString(),
      },
    });

    createdInteractionId = interaction.id;

    console.log(`Created InboundInteraction:`);
    console.log(`  ID: ${interaction.id}`);
    console.log(`  Lifecycle State: ${interaction.lifecycleState}`);
    console.log(`  External Interaction Key: ${interaction.externalInteractionKey}`);

    // ----------------------------------------------------
    // STAGE 2 - CONSENT & NORMALIZATION
    // ----------------------------------------------------
    console.log("\n[STAGE 2 - CONSENT & NORMALIZATION]");
    console.log("Executing processInboundNormalization...");
    const normJob = {
      data: {
        interactionId: interaction.id,
        externalInteractionKey: interaction.externalInteractionKey,
      },
    } as any;

    await __receptionRuntimeWorkerTestInternals.processInboundNormalization(normJob);

    // Reload interaction from DB
    let updatedInteraction = await prisma.inboundInteraction.findUnique({
      where: { id: interaction.id },
    });
    console.log(`Interaction Lifecycle State after Normalization: ${updatedInteraction?.lifecycleState}`);

    // Check if any consent record was created
    const consents = await prisma.consentLedger.findMany({
      where: { leadId: lead.id },
    });
    console.log(`Consent Records in DB for Lead: ${consents.length}`);

    // ----------------------------------------------------
    // STAGE 3 - ROUTING DECISION & EXECUTION GATE
    // ----------------------------------------------------
    console.log("\n[STAGE 3 - ROUTING DECISION & EXECUTION GATE]");
    console.log("Executing processInboundClassification...");
    const classJob = {
      data: {
        interactionId: interaction.id,
        externalInteractionKey: interaction.externalInteractionKey,
      },
    } as any;
    await __receptionRuntimeWorkerTestInternals.processInboundClassification(classJob);

    updatedInteraction = await prisma.inboundInteraction.findUnique({
      where: { id: interaction.id },
    });
    console.log(`Interaction Lifecycle State after Classification: ${updatedInteraction?.lifecycleState}`);

    // Now evaluate the gate that runs inside processInboundRouting
    console.log("Evaluating resolveFreshReceptionExecutionGate...");
    const executionGate = await resolveFreshReceptionExecutionGate({
      businessId,
      leadId: lead.id,
      channel: "INSTAGRAM",
    });

    console.log("Gate Evaluation Results:");
    console.log("  references.consent:", JSON.stringify(executionGate.references.consent, null, 2));
    console.log("  references.consent.status:", executionGate.references.consent?.status || "null");
    console.log("  leadId:", lead.id);
    console.log("  businessId:", businessId);
    console.log(`  gate.allowed: ${executionGate.gate.allowed}`);
    console.log(`  gate.blockRoute: ${executionGate.gate.blockRoute}`);
    console.log(`  gate.reasons: ${JSON.stringify(executionGate.gate.reasons)}`);

    // Verify condition: if (!references.consent || references.consent.status === "UNKNOWN")
    const isConditionTrue = !executionGate.references.consent || executionGate.references.consent.status === "UNKNOWN";
    console.log(`Condition (!references.consent || references.consent.status === "UNKNOWN") is: ${isConditionTrue ? "TRUE" : "FALSE"}`);

    // ----------------------------------------------------
    // STAGE 4 - ROUTING EXECUTION & QUEUE
    // ----------------------------------------------------
    console.log("\n[STAGE 4 - ROUTING EXECUTION & QUEUE]");
    console.log("Executing processInboundRouting...");
    const routeJob = {
      data: {
        interactionId: interaction.id,
        externalInteractionKey: interaction.externalInteractionKey,
      },
    } as any;
    await __receptionRuntimeWorkerTestInternals.processInboundRouting(routeJob);

    updatedInteraction = await prisma.inboundInteraction.findUnique({
      where: { id: interaction.id },
    });
    console.log(`Interaction details after Routing:`);
    console.log(`  Lifecycle State: ${updatedInteraction?.lifecycleState}`);
    console.log(`  Route Decision: ${updatedInteraction?.routeDecision}`);
    console.log(`  Metadata:`, JSON.stringify(updatedInteraction?.metadata, null, 2));

    // Check if human work queue assignment was created
    const humanQueueItem = await prisma.humanWorkQueue.findFirst({
      where: { interactionId: interaction.id },
    });
    console.log(`HumanWorkQueue assignment created: ${humanQueueItem ? "YES" : "NO"}`);
    if (humanQueueItem) {
      console.log(`  Assigned Queue Type: ${humanQueueItem.queueType}`);
      console.log(`  State: ${humanQueueItem.state}`);
    }

    console.log(`\nWas enqueueRevenueBrainBridge() executed? ${wasRevenueBrainBridgeEnqueued ? "YES" : "NO"}`);

  } catch (error: any) {
    console.error("TRACE FAILED WITH ERROR:", error);
  } finally {
    // Clean up seeded data
    console.log("\nCleaning up seeded database entries...");
    if (createdInteractionId) {
      await prisma.humanWorkQueue.deleteMany({ where: { interactionId: createdInteractionId } }).catch(() => {});
    }
    await prisma.traceLedger.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.inboundInteraction.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.lead.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.client.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.subscriptionLedger.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.usageDaily.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    console.log("Cleanup completed.");
  }
}

run().then(() => prisma.$disconnect());
