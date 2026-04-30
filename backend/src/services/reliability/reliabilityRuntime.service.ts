import { getQueueHealth } from "../queueHealth.service";
import { getReceptionMetricsSnapshot } from "../receptionMetrics.service";
import { getSystemHealth } from "../systemHealth.service";
import { appointmentProjectionService } from "../appointmentProjection.service";
import { commerceProjectionService } from "../commerceProjection.service";
import {
  recordCapacityLedger,
  recordCostLedger,
  recordMetricSnapshot,
} from "./reliabilityOS.service";

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export const collectReliabilityRuntimeSnapshot = async ({
  businessId = null,
}: {
  businessId?: string | null;
}) => {
  const [system, queues, reception] = await Promise.all([
    getSystemHealth(),
    getQueueHealth(),
    Promise.resolve(getReceptionMetricsSnapshot()),
  ]);

  const queueLag = sum(queues.map((queue) => Math.max(0, Number(queue.waiting || 0))));
  const queueFailed = sum(queues.map((queue) => Math.max(0, Number(queue.failed || 0))));
  const queueActive = sum(queues.map((queue) => Math.max(0, Number(queue.active || 0))));
  const queueDelayed = sum(queues.map((queue) => Math.max(0, Number(queue.delayed || 0))));
  const queueTotal = Math.max(1, queueLag + queueActive + queueDelayed + queueFailed);
  const workerUtilization = queueActive / Math.max(1, queueActive + queueLag);
  const dlqRate = queueFailed / queueTotal;
  const retryRate = queueDelayed / queueTotal;

  const snapshots = [
    await recordMetricSnapshot({
      businessId,
      tenantId: businessId,
      subsystem: "INFRA",
      throughput:
        toNumber(reception.inbound_received_total) +
        toNumber(reception.routed_total),
      latencyP50Ms: toNumber(reception.avg_first_response_time),
      latencyP95Ms: toNumber(reception.avg_resolution_time),
      latencyP99Ms: toNumber(reception.avg_resolution_time) * 1.4,
      queueLag,
      workerUtilization,
      dlqRate,
      retryRate,
      lockContention: 0,
      providerErrorRate:
        system.redis.status === "ok" && system.database.status === "ok" ? 0 : 1,
      memoryUsage: toNumber(system.memory.heapUsed),
      cpuUsage: toNumber(system.cpu.usagePercent),
      networkUsage: 0,
      storageGrowth: toNumber(system.memory.rss),
      metadata: {
        redis: system.redis,
        database: system.database,
      },
    }),
    await recordMetricSnapshot({
      businessId,
      tenantId: businessId,
      subsystem: "RECEPTION",
      throughput: toNumber(reception.inbound_received_total),
      latencyP50Ms: toNumber(reception.avg_first_response_time),
      latencyP95Ms: toNumber(reception.avg_resolution_time),
      latencyP99Ms: toNumber(reception.avg_resolution_time) * 1.2,
      queueLag,
      workerUtilization,
      dlqRate,
      retryRate,
      lockContention: 0,
      providerErrorRate: 0,
      bookingFunnel: {
        routed: toNumber(reception.appointment_routed_total),
      },
      commerceFunnel: {
        routed: toNumber(reception.support_routed_total),
      },
      revenueFunnel: {
        routed: toNumber(reception.revenue_routed_total),
      },
      metadata: {
        counters: reception,
      },
    }),
  ];

  if (businessId) {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60_000);
    const [bookingProjection, commerceProjection] = await Promise.all([
      appointmentProjectionService.getOpsProjection({
        businessId,
        from,
        to,
      }),
      commerceProjectionService.buildProjection({
        businessId,
        from,
        to,
      }),
    ]);

    snapshots.push(
      await recordMetricSnapshot({
        businessId,
        tenantId: businessId,
        subsystem: "BOOKING",
        throughput: toNumber(bookingProjection.counts?.requested),
        latencyP50Ms: toNumber(reception.avg_first_response_time),
        latencyP95Ms: toNumber(reception.avg_resolution_time),
        latencyP99Ms: toNumber(reception.avg_resolution_time) * 1.1,
        queueLag: toNumber(bookingProjection.counts?.requested) -
          toNumber(bookingProjection.counts?.confirmed),
        workerUtilization: toNumber(bookingProjection.utilizationPercent) / 100,
        dlqRate: toNumber(bookingProjection.cancelPercent) / 100,
        retryRate: toNumber(bookingProjection.reschedulePercent) / 100,
        lockContention: 0,
        providerErrorRate: 0,
        bookingFunnel: {
          requested: bookingProjection.counts?.requested || 0,
          confirmed: bookingProjection.counts?.confirmed || 0,
          completed: bookingProjection.counts?.completed || 0,
        },
        revenueFunnel: {
          revenueAfterMeeting: bookingProjection.revenueAfterMeeting || 0,
        },
      })
    );

    const projection = commerceProjection as any;
    const recognizedMinor = toNumber(projection.revenue?.recognizedMinor, 0);
    const totalCostMinor =
      toNumber(projection.revenue?.refundsMinor, 0) +
      toNumber(projection.revenue?.chargebacksMinor, 0);
    const marginPercent =
      recognizedMinor > 0
        ? (recognizedMinor - totalCostMinor) / Math.max(1, recognizedMinor)
        : 0;

    await recordCostLedger({
      businessId,
      tenantId: businessId,
      provider: "COMMERCE",
      workflow: "PAYMENTS",
      scopeType: "TENANT",
      scopeId: businessId,
      amountMinor: totalCostMinor,
      usageUnits: toNumber(projection.paymentIntent?.counts?.succeeded, 1),
      unitCostMinor: Math.round(
        totalCostMinor /
          Math.max(1, toNumber(projection.paymentIntent?.counts?.succeeded, 1))
      ),
      marginPercent,
      metadata: {
        recognizedMinor,
      },
    });

    await recordCapacityLedger({
      businessId,
      tenantId: businessId,
      subsystem: "BOOKING",
      scopeType: "TENANT",
      scopeId: businessId,
      currentLoad: toNumber(bookingProjection.counts?.requested),
      capacityLimit: Math.max(1, toNumber(bookingProjection.counts?.requested) + 10),
      forecastDemand: Math.max(
        1,
        toNumber(bookingProjection.counts?.requested) +
          toNumber(bookingProjection.counts?.followupBooked)
      ),
      metadata: {
        projectionWindow: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
      },
    });
  }

  return {
    system,
    queues,
    reception,
    snapshots,
  };
};
