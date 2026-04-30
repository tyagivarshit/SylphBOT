import { applyIntegrationSchema, configureIntegrationEnvironment } from "./harness/env";
import { createIntegrationRuntime } from "./harness/bootstrap";
import type { IntegrationSuite } from "./harness/types";
import { inboundE2ESuite } from "./suites/inbound.e2e.test";
import { inboundReplayE2ESuite } from "./suites/inbound.replay.e2e.test";
import { malformedFailClosedE2ESuite } from "./suites/malformed.failclosed.e2e.test";
import { consentBlockE2ESuite } from "./suites/consent.block.e2e.test";
import { humanTakeoverE2ESuite } from "./suites/human.takeover.e2e.test";
import { revenueBridgeE2ESuite } from "./suites/revenue.bridge.e2e.test";
import { workerRetryReplayE2ESuite } from "./suites/worker.retry.replay.e2e.test";
import { slaLeaderE2ESuite } from "./suites/sla.leader.e2e.test";
import { resolutionReopenE2ESuite } from "./suites/resolution.reopen.e2e.test";
import { dashboardProjectionE2ESuite } from "./suites/dashboard.projection.e2e.test";
import { concurrencyDuplicateE2ESuite } from "./suites/concurrency.duplicate.e2e.test";
import { outboxFlowE2ESuite } from "./suites/outbox.flow.e2e.test";
import { failureInjectionE2ESuite } from "./suites/failure.injection.e2e.test";

const suites: IntegrationSuite[] = [
  inboundE2ESuite,
  inboundReplayE2ESuite,
  malformedFailClosedE2ESuite,
  consentBlockE2ESuite,
  humanTakeoverE2ESuite,
  revenueBridgeE2ESuite,
  workerRetryReplayE2ESuite,
  slaLeaderE2ESuite,
  resolutionReopenE2ESuite,
  dashboardProjectionE2ESuite,
  concurrencyDuplicateE2ESuite,
  outboxFlowE2ESuite,
  failureInjectionE2ESuite,
];

const run = async () => {
  const environment = configureIntegrationEnvironment();

  console.log("[integration] run id:", environment.runId);
  console.log("[integration] queue prefix:", environment.queuePrefix);
  console.log("[integration] applying prisma schema for isolated database");

  applyIntegrationSchema();

  const runtime = await createIntegrationRuntime(environment);
  let failures = 0;

  try {
    for (const suite of suites) {
      const startedAt = Date.now();
      console.log(`[integration] START ${suite.name}`);

      try {
        await suite.run(runtime.harness);
        const elapsedMs = Date.now() - startedAt;
        console.log(`[integration] PASS  ${suite.name} (${elapsedMs}ms)`);
      } catch (error) {
        failures += 1;
        const elapsedMs = Date.now() - startedAt;
        console.error(`[integration] FAIL  ${suite.name} (${elapsedMs}ms)`);
        console.error(error);
      }
    }
  } finally {
    await runtime.shutdown().catch(() => undefined);
  }

  if (failures > 0) {
    process.exitCode = 1;
    console.error(`[integration] completed with ${failures} failing suite(s)`);
    return;
  }

  console.log(`[integration] all ${suites.length} suites passed`);
};

void run();
