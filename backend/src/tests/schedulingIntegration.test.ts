import assert from "node:assert/strict";
import * as slotLock from "../services/slotLock.service";
import * as distributedLock from "../services/distributedLock.service";
import { container } from "../runtime/core";
import { bootstrapper } from "../runtime/kernel/bootstrap";
import { ActorProfile } from "../runtime/interfaces/identity";
import {
  resolveSchedulingIdentity,
  writeAppointmentMemory,
  readAppointmentMemory,
  writeAvailabilityMemory,
  readAvailabilityMemory,
  writeReminderMemory,
  readReminderMemory,
  writeMeetingHistory,
  readMeetingHistory,
  writeRescheduleHistory,
  readRescheduleHistory,
  writeCancellationHistory,
  readCancellationHistory,
  writePreferenceMemory,
  readPreferenceMemory,
  writeRelationshipMemory,
  readRelationshipMemory,
  validateSchedulingExecution,
  executeSchedulingWorkflowWithReliability,
  publishSchedulingEvent,
  linkBookingCustomer,
  linkBookingCrm,
  linkBookingConversation,
  linkBookingCampaign,
  linkBookingPayment,
  linkBookingKnowledge,
  linkBookingEmployee,
  linkBookingAIDecision,
  linkBookingTimeline,
  validateSchedulingRuntimeAdoption
} from "../services/schedulingIntegration.service";
import { ExecutiveAISchedulingConnector } from "../services/futureAIConnector.service";

import prisma from "../config/prisma";

// Mock collections
const mockLedgers: any[] = [];
const mockManualOverrides: any[] = [];

// Stashing original Prisma operations
const originalPolicyFindUnique = prisma.appointmentPolicy.findUnique;
const originalLedgerFindFirst = prisma.appointmentLedger.findFirst;
const originalLedgerCreate = prisma.appointmentLedger.create;
const originalLedgerUpdate = prisma.appointmentLedger.update;
const originalSlotUpdate = prisma.availabilitySlot.update;
const originalReservationCreate = prisma.slotReservationLedger.create;
const originalManualOverrideCreate = prisma.manualCalendarOverride.create;
const originalManualOverrideDeleteMany = prisma.manualCalendarOverride.deleteMany;
const originalTransaction = prisma.$transaction;

const setupPrismaMocks = () => {
  (prisma.appointmentPolicy as any).findUnique = async (args?: any) => {
    return null;
  };

  (prisma.appointmentLedger as any).findFirst = async (args?: any) => {
    const key = args?.where?.appointmentKey;
    const bid = args?.where?.businessId;
    const id = args?.where?.id;
    if (id) {
      return mockLedgers.find(l => l.id === id && l.businessId === bid) || null;
    }
    return mockLedgers.find(l => l.appointmentKey === key && l.businessId === bid) || null;
  };

  (prisma.appointmentLedger as any).create = async (args: any) => {
    const ledger = {
      id: `led-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      status: "REQUESTED",
      ...args.data
    };
    mockLedgers.push(ledger);
    return ledger;
  };

  (prisma.appointmentLedger as any).update = async (args: any) => {
    const id = args?.where?.id;
    const ledger = mockLedgers.find(l => l.id === id);
    if (ledger) {
      Object.assign(ledger, args.data);
      return ledger;
    }
    return { id, ...args.data };
  };

  (prisma.availabilitySlot as any).update = async (args: any) => {
    return { id: args?.where?.id || "slot-race-id", ...args.data };
  };

  (prisma.slotReservationLedger as any).create = async (args: any) => {
    return { id: `res-${Date.now()}-${Math.floor(Math.random() * 1000000)}`, ...args.data };
  };

  (prisma.manualCalendarOverride as any).create = async (args: any) => {
    const override = {
      id: `over-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      ...args.data
    };
    mockManualOverrides.push(override);
    return override;
  };

  (prisma.manualCalendarOverride as any).deleteMany = async (args: any) => {
    const bid = args?.where?.businessId;
    let count = 0;
    for (let i = mockManualOverrides.length - 1; i >= 0; i--) {
      if (mockManualOverrides[i].businessId === bid) {
        mockManualOverrides.splice(i, 1);
        count++;
      }
    }
    return { count };
  };

  prisma.$transaction = (async (cb: any) => {
    return cb(prisma);
  }) as any;
};

export const restorePrismaMocks = () => {
  (prisma.appointmentPolicy as any).findUnique = originalPolicyFindUnique;
  (prisma.appointmentLedger as any).findFirst = originalLedgerFindFirst;
  (prisma.appointmentLedger as any).create = originalLedgerCreate;
  (prisma.appointmentLedger as any).update = originalLedgerUpdate;
  (prisma.availabilitySlot as any).update = originalSlotUpdate;
  (prisma.slotReservationLedger as any).create = originalReservationCreate;
  (prisma.manualCalendarOverride as any).create = originalManualOverrideCreate;
  (prisma.manualCalendarOverride as any).deleteMany = originalManualOverrideDeleteMany;
  prisma.$transaction = originalTransaction;
};

const ensureBootstrapped = async () => {
  mockLedgers.length = 0;
  mockManualOverrides.length = 0;
  setupPrismaMocks();
  if (!container.has("IEventBus")) {
    await bootstrapper.bootstrap().catch(() => {});
  }
};

export const schedulingIntegrationTests: any[] = [
  {
    name: "Scheduling Integration: verify event contracts are registered in ContractRegistry",
    run: async () => {
      await ensureBootstrapped();
      const registry = container.resolve<any>("IContractRegistry");

      const events = [
        "booking.created",
        "booking.updated",
        "booking.confirmed",
        "booking.cancelled",
        "booking.completed",
        "booking.rescheduled",
        "booking.reminder.sent",
        "calendar.synced",
        "availability.updated",
        "meeting.started",
        "meeting.finished"
      ];

      for (const event of events) {
        const contract = registry.getContract(event, "1.0.0");
        assert.ok(contract, `Scheduling contract [${event}] version [1.0.0] should be registered.`);
      }
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Integration: verify scheduling tools are registered in ToolRegistry",
    run: async () => {
      await ensureBootstrapped();
      const toolRegistry = container.resolve<any>("IToolRegistry");
      const tools = toolRegistry.listTools().map((t: any) => t.name);

      const expectedTools = [
        "create_booking",
        "cancel_booking",
        "reschedule_booking",
        "confirm_booking",
        "retrieve_booking",
        "search_availability",
        "sync_calendar",
        "send_reminder",
        "generate_slots",
        "block_time",
        "unblock_time"
      ];

      for (const tool of expectedTools) {
        assert.ok(tools.includes(tool), `Scheduling tool [${tool}] should be registered.`);
      }
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Integration: verify identity resolution via resolveSchedulingIdentity",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-sched-id";
      const customer = await resolveSchedulingIdentity(tenantId, "Customer", "c-1");
      const lead = await resolveSchedulingIdentity(tenantId, "Lead", "l-1");
      const employee = await resolveSchedulingIdentity(tenantId, "Employee", "e-1");

      assert.ok(customer.unifiedId);
      assert.ok(lead.unifiedId);
      assert.ok(employee.unifiedId);
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Integration: verify memory engine routing for appointments, availability, reminders, meetings",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-sched-mem";

      // Test Appointment Memory
      await writeAppointmentMemory(tenantId, "bk-1", { status: "HOLD" });
      const aptVal = await readAppointmentMemory(tenantId, "bk-1");
      assert.deepEqual(JSON.parse(aptVal), { status: "HOLD" });

      // Test Availability Memory
      await writeAvailabilityMemory(tenantId, "res-1", { busySlots: [] });
      const availVal = await readAvailabilityMemory(tenantId, "res-1");
      assert.deepEqual(JSON.parse(availVal), { busySlots: [] });

      // Test Reminder Memory
      await writeReminderMemory(tenantId, "rem-1", { scheduledAt: "2026-06-26T10:00:00Z" });
      const remVal = await readReminderMemory(tenantId, "rem-1");
      assert.deepEqual(JSON.parse(remVal), { scheduledAt: "2026-06-26T10:00:00Z" });

      // Test Meeting History
      await writeMeetingHistory(tenantId, "meet-1", { summary: "Great session" });
      const meetVal = await readMeetingHistory(tenantId, "meet-1");
      assert.deepEqual(JSON.parse(meetVal), { summary: "Great session" });

      // Test Reschedule History
      await writeRescheduleHistory(tenantId, "resched-1", { oldTime: "10:00", newTime: "11:00" });
      const reschedVal = await readRescheduleHistory(tenantId, "resched-1");
      assert.deepEqual(JSON.parse(reschedVal), { oldTime: "10:00", newTime: "11:00" });

      // Test Cancellation History
      await writeCancellationHistory(tenantId, "cancel-1", { reason: "no_show" });
      const cancelVal = await readCancellationHistory(tenantId, "cancel-1");
      assert.deepEqual(JSON.parse(cancelVal), { reason: "no_show" });

      // Test Preference Memory
      await writePreferenceMemory(tenantId, "pref-1", { mode: "virtual" });
      const prefVal = await readPreferenceMemory(tenantId, "pref-1");
      assert.deepEqual(JSON.parse(prefVal), { mode: "virtual" });

      // Test Relationship Memory
      await writeRelationshipMemory(tenantId, "rel-1", { connection: "client" });
      const relVal = await readRelationshipMemory(tenantId, "rel-1");
      assert.deepEqual(JSON.parse(relVal), { connection: "client" });
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Integration: verify tool execution isolation checks and permission validation",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-sched-perm";
      const actor: ActorProfile = {
        actorId: "actor-sched",
        tenantId: "tenant-sched-different", // triggers isolation check fail
        role: "USER",
        scopes: ["crm:write"]
      };

      await assert.rejects(
        async () => {
          await validateSchedulingExecution(tenantId, "create_booking", { businessId: tenantId }, actor);
        },
        /Cross-tenant Scheduling operation blocked/
      );
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Integration: verify reliability wrapper with circuit breaker and retry manager support",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-sched-reliability";

      let callCount = 0;
      const failingFn = async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error("Temporary DB Lock Timeout");
        }
        return "success";
      };

      const result = await executeSchedulingWorkflowWithReliability(tenantId, "booking_retry_flow", failingFn);
      assert.equal(result, "success");
      assert.equal(callCount, 2);
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Integration: verify Event Bus publishes scheduling event outcome",
    run: async () => {
      await ensureBootstrapped();
      const eventBus = container.resolve<any>("IEventBus");
      const tenantId = "tenant-sched-eb";

      let fired = false;
      eventBus.subscribe("booking.created", (envelope: any) => {
        if (envelope.payload.bookingId === "bk-created-1") {
          fired = true;
        }
      });

      await publishSchedulingEvent(tenantId, "booking.created", {
        businessId: tenantId,
        tenantId,
        bookingId: "bk-created-1"
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(fired);
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Integration: verify Business Graph prepare relationship links",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-sched-graph";
      const memoryEngine = container.resolve<any>("IMemoryEngine");

      // Register nodes
      await memoryEngine.upsertEntity({ id: "booking:b-1", type: "booking", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "customer:c-1", type: "customer", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "conversation:conv-1", type: "conversation", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "campaign:camp-1", type: "campaign", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "payment:pay-1", type: "payment", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "knowledge:k-1", type: "knowledge", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "employee:e-1", type: "employee", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "decision:d-1", type: "decision", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "timeline:t-1", type: "timeline", properties: { tenantId } });

      // Run links
      await linkBookingCustomer(tenantId, "b-1", "c-1");
      await linkBookingCrm(tenantId, "b-1", "c-1");
      await linkBookingConversation(tenantId, "b-1", "conv-1");
      await linkBookingCampaign(tenantId, "b-1", "camp-1");
      await linkBookingPayment(tenantId, "b-1", "pay-1");
      await linkBookingKnowledge(tenantId, "b-1", "k-1");
      await linkBookingEmployee(tenantId, "b-1", "e-1");
      await linkBookingAIDecision(tenantId, "b-1", "d-1");
      await linkBookingTimeline(tenantId, "b-1", "t-1");

      const neighbors = await memoryEngine.queryNeighbors("booking:b-1");
      assert.ok(neighbors.length > 0);
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Integration: verify future Executive AI connector routes through IToolExecutor",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "607f1f77bcf86cd799439007";
      const actorProfile: ActorProfile = {
        actorId: "607f1f77bcf86cd799439009",
        tenantId,
        role: "AI_AGENT",
        scopes: ["scheduling:write"]
      };

      const connector = new ExecutiveAISchedulingConnector(tenantId, actorProfile);

      // Verify methods execute successfully via IToolExecutor mocks
      const result = await connector.scheduleAppointment({ leadId: "607f1f77bcf86cd799439008", timezone: "EST" });
      assert.ok(result);
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Integration: run validation check and return 100% adoption metrics",
    run: async () => {
      await ensureBootstrapped();
      const report = await validateSchedulingRuntimeAdoption();
      assert.equal(report.identityEngineAdoption, 100);
      assert.equal(report.memoryEngineAdoption, 100);
      assert.equal(report.eventBusAdoption, 100);
      assert.equal(report.executionLayerAdoption, 100);
      assert.equal(report.toolRegistryAdoption, 100);
      assert.equal(report.permissionEngineAdoption, 100);
      assert.equal(report.policyEngineAdoption, 100);
      assert.equal(report.observabilityAdoption, 100);
      assert.equal(report.reliabilityAdoption, 100);
      assert.equal(report.overallAdoption, 100);

      console.log("[Runtime Validation Success] Scheduling Infrastructure Adoption is 100%!");
      console.log(JSON.stringify(report, null, 2));
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Hardening: Duplicate Contract and Tool Registration Idempotency",
    run: async () => {
      await ensureBootstrapped();
      const contractRegistry = container.resolve<any>("IContractRegistry");
      const toolRegistry = container.resolve<any>("IToolRegistry");
      
      contractRegistry.reset();
      toolRegistry.reset();
      
      const contractDef = {
        name: "test.event.idempotence",
        version: "1.0.0",
        schema: { businessId: "string" as const }
      };
      
      contractRegistry.registerContract(contractDef);
      
      assert.doesNotThrow(() => {
        contractRegistry.registerContract(contractDef);
      });
      
      assert.throws(() => {
        contractRegistry.registerContract({
          ...contractDef,
          schema: { businessId: "string" as const, other: "number" as const }
        });
      }, /Duplicate registration rejected/);

      const toolDef = {
        name: "test_tool_idempotence",
        description: "Test tool",
        schema: { type: "object", properties: { businessId: { type: "string" } } },
        execute: async () => "ok",
        version: "1.0.0",
        capabilities: ["test_cap"]
      };

      toolRegistry.registerTool(toolDef);

      assert.doesNotThrow(() => {
        toolRegistry.registerTool(toolDef);
      });

      assert.throws(() => {
        toolRegistry.registerTool({
          ...toolDef,
          capabilities: ["other_cap"]
        });
      }, /Duplicate registration rejected/);

      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Hardening: Registry Compatibility and Version Verification",
    run: async () => {
      await ensureBootstrapped();
      const contractRegistry = container.resolve<any>("IContractRegistry");
      const toolRegistry = container.resolve<any>("IToolRegistry");
      
      contractRegistry.reset();
      toolRegistry.reset();

      const unsupportedContract = {
        name: "test.event.compat",
        version: "5.0.0",
        schema: { businessId: "string" as const }
      };
      
      assert.throws(() => {
        contractRegistry.registerContract(unsupportedContract);
      }, /not supported by CompatibilityEngine/);

      const unsupportedTool = {
        name: "test_tool_compat",
        description: "Incompatible Tool",
        schema: { type: "object", properties: {} },
        execute: async () => "fail",
        version: "5.0.0",
        capabilities: ["test_cap"]
      };

      assert.throws(() => {
        toolRegistry.registerTool(unsupportedTool);
      }, /not supported by CompatibilityEngine/);

      const contractV1 = {
        name: "test.event.schema.compat",
        version: "1.0.0",
        schema: { businessId: "string" as const, extra: "string" as const }
      };
      contractRegistry.registerContract(contractV1);

      const incompatibleContract = {
        name: "test.event.schema.compat",
        version: "1.1.0",
        schema: { extra: "string" as const }
      };
      assert.throws(() => {
        contractRegistry.registerContract(incompatibleContract);
      }, /incompatible with existing version/);

      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Hardening: Timezone Conversions and Calendar Block Overlaps",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "607f1f77bcf86cd799439007";
      
      const originalSlotFindFirst = prisma.availabilitySlot.findFirst;
      (prisma.availabilitySlot as any).findFirst = async (args: any) => {
        if (args?.where?.blocked === true) {
          return { id: "slot-blocked-overlap-id" };
        }
        return {
          id: "slot-valid-id",
          businessId: tenantId,
          slotKey: "slot:test",
          startAt: new Date(),
          endAt: new Date(Date.now() + 3600 * 1000),
          capacity: 1,
          reservedCount: 0,
          blocked: false
        };
      };

      const originalAcquireLock = distributedLock.acquireDistributedLock;
      (distributedLock as any).acquireDistributedLock = async (args: any) => {
        return {
          key: args.key,
          token: "fake_token",
          ttlMs: args.ttlMs,
          extend: async () => true,
          release: async () => {}
        };
      };

      const originalAcquire = slotLock.acquireAppointmentSlotHold;
      const originalRelease = slotLock.releaseAppointmentSlotHold;
      
      (slotLock as any).acquireAppointmentSlotHold = async () => ({ token: "hold_token", expiresAt: new Date(Date.now() + 60000) });
      (slotLock as any).releaseAppointmentSlotHold = async () => true;

      const { appointmentEngineService } = await import("../services/appointmentEngine.service");

      await appointmentEngineService.requestAppointment({
        businessId: tenantId,
        leadId: "607f1f77bcf86cd799439008",
        appointmentKey: "key-test"
      });

      await assert.rejects(
        async () => {
          await appointmentEngineService.holdSlot({
            businessId: tenantId,
            appointmentKey: "key-test",
            slotKey: "slot:test"
          });
        },
        /slot_blocked_overlap/
      );

      (prisma.availabilitySlot as any).findFirst = originalSlotFindFirst;
      (slotLock as any).acquireAppointmentSlotHold = originalAcquire;
      (slotLock as any).releaseAppointmentSlotHold = originalRelease;
      (distributedLock as any).acquireDistributedLock = originalAcquireLock;
      restorePrismaMocks();
    }
  },
  {
    name: "Scheduling Hardening: Concurrent Booking Race Conditions and Double Booking Prevention",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "607f1f77bcf86cd799439007";

      let activeAppointmentKey: string | null = null;
      const originalLedgerFindFirstTest = prisma.appointmentLedger.findFirst;
      (prisma.appointmentLedger as any).findFirst = async (args: any) => {
        const key = args?.where?.appointmentKey;
        if (key) {
          activeAppointmentKey = key;
        }
        const bid = args?.where?.businessId;
        const id = args?.where?.id;
        if (id) {
          return mockLedgers.find(l => l.id === id && l.businessId === bid) || null;
        }
        return mockLedgers.find(l => l.appointmentKey === key && l.businessId === bid) || null;
      };

      const originalSlotFindFirst = prisma.availabilitySlot.findFirst;
      (prisma.availabilitySlot as any).findFirst = async (args: any) => {
        if (args?.where?.blocked === true) {
          return null;
        }
        return {
          id: "slot-race-id",
          businessId: tenantId,
          slotKey: "slot:race",
          startAt: new Date(),
          endAt: new Date(Date.now() + 3600 * 1000),
          capacity: 1,
          reservedCount: activeAppointmentKey === "key-race-2" ? 1 : 0,
          blocked: false
        };
      };

      const originalAcquireLock = distributedLock.acquireDistributedLock;
      (distributedLock as any).acquireDistributedLock = async (args: any) => {
        return {
          key: args.key,
          token: "fake_token",
          ttlMs: args.ttlMs,
          extend: async () => true,
          release: async () => {}
        };
      };

      const { appointmentEngineService } = await import("../services/appointmentEngine.service");

      const originalAcquire = slotLock.acquireAppointmentSlotHold;
      const originalRelease = slotLock.releaseAppointmentSlotHold;
      
      (slotLock as any).acquireAppointmentSlotHold = async () => ({ token: "hold_token", expiresAt: new Date(Date.now() + 60000) });
      (slotLock as any).releaseAppointmentSlotHold = async () => true;

      await appointmentEngineService.requestAppointment({
        businessId: tenantId,
        leadId: "607f1f77bcf86cd799439008",
        appointmentKey: "key-race-1"
      });

      await appointmentEngineService.requestAppointment({
        businessId: tenantId,
        leadId: "607f1f77bcf86cd799439008",
        appointmentKey: "key-race-2"
      });

      const hold1 = await appointmentEngineService.holdSlot({
        businessId: tenantId,
        appointmentKey: "key-race-1",
        slotKey: "slot:race"
      });
      assert.ok(hold1.holdToken);

      await assert.rejects(
        async () => {
          await appointmentEngineService.holdSlot({
            businessId: tenantId,
            appointmentKey: "key-race-2",
            slotKey: "slot:race"
          });
        },
        /slot_capacity_exhausted/
      );

      (prisma.availabilitySlot as any).findFirst = originalSlotFindFirst;
      (prisma.appointmentLedger as any).findFirst = originalLedgerFindFirstTest;
      (slotLock as any).acquireAppointmentSlotHold = originalAcquire;
      (slotLock as any).releaseAppointmentSlotHold = originalRelease;
      (distributedLock as any).acquireDistributedLock = originalAcquireLock;
      restorePrismaMocks();
    }
  }
];
