#!/usr/bin/env node
/* eslint-disable no-console */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getLeadsBatchInfo } from "../utils/businessIdResolver";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const prisma = new PrismaClient();

// Configuration
const DEFAULT_PROGRESS_FILE = path.resolve(__dirname, "backfill-progress.json");
const DEFAULT_UPDATED_IDS_FILE = path.resolve(__dirname, "backfilled-message-ids.log");
const DEFAULT_BATCH_SIZE = 1000;

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const fresh = args.includes("--fresh");

const batchSizeArg = args.find(arg => arg.startsWith("--batch-size="));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split("=")[1], 10) : DEFAULT_BATCH_SIZE;

const limitArg = args.find(arg => arg.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

const progressFileArg = args.find(arg => arg.startsWith("--progress-file="));
const progressFilePath = progressFileArg ? path.resolve(progressFileArg.split("=")[1]) : DEFAULT_PROGRESS_FILE;

const logFileArg = args.find(arg => arg.startsWith("--log-file="));
const logFilePath = logFileArg ? path.resolve(logFileArg.split("=")[1]) : DEFAULT_UPDATED_IDS_FILE;

// Logging helpers
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(msg: string, err?: any) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`, err || "");
}

async function main() {
  log("=========================================================");
  log("MESSAGE BUSINESS ID BACKFILL MIGRATION SCRIPT (TYPESCRIPT)");
  log(`Mode: ${dryRun ? "DRY-RUN (No database writes)" : "EXECUTE (Live database writes)"}`);
  log(`Batch Size: ${batchSize}`);
  log(`Limit: ${limit ? limit : "None"}`);
  log(`Progress File: ${progressFilePath}`);
  log(`Updated IDs Log File: ${logFilePath}`);
  log("=========================================================");

  // Check database connection
  try {
    await prisma.$connect();
    log("Successfully connected to the database.");
  } catch (err) {
    logError("Failed to connect to the database.", err);
    process.exit(1);
  }

  // Fetch count of total messages and messages needing backfill
  log("Analyzing database records...");
  let totalMessages = 0;
  let totalPending = 0;

  try {
    totalMessages = await prisma.message.count();
    totalPending = await prisma.message.count({
      where: {
        businessId: null
      }
    });
  } catch (err) {
    logError("Failed to fetch message counts from database.", err);
    await prisma.$disconnect();
    process.exit(1);
  }

  log(`Total messages in database: ${totalMessages}`);
  log(`Messages with null businessId (needing backfill): ${totalPending}`);

  let lastProcessedId: string | null = null;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const failedLeadIds = new Set<string>();
  const orphanMessageIds: string[] = [];
  const dbWriteErrors: { messageId: string; error: string }[] = [];

  // Load progress if not fresh
  if (!fresh && fs.existsSync(progressFilePath)) {
    try {
      const progressData = JSON.parse(fs.readFileSync(progressFilePath, "utf8"));
      lastProcessedId = progressData.lastProcessedId;
      totalProcessed = progressData.totalProcessed || 0;
      totalUpdated = progressData.totalUpdated || 0;
      totalFailed = progressData.totalFailed || 0;
      totalSkipped = progressData.totalSkipped || 0;
      log(`Resuming from last processed ID: ${lastProcessedId}`);
      log(`Progress loaded: Processed=${totalProcessed}, Updated=${totalUpdated}, Failed=${totalFailed}, Skipped=${totalSkipped}`);
    } catch (err) {
      logError("Failed to read progress file. Starting from the beginning.", err);
    }
  }

  // Initialize updated IDs log file if fresh or not existing
  if (!dryRun && (fresh || !fs.existsSync(logFilePath))) {
    try {
      fs.writeFileSync(logFilePath, "", "utf8");
    } catch (err) {
      logError("Failed to initialize updated IDs log file.", err);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  const startTime = Date.now();
  let isDone = false;

  // Track active stream for writing updated IDs
  let logStream: fs.WriteStream | null = null;
  if (!dryRun) {
    try {
      logStream = fs.createWriteStream(logFilePath, { flags: "a", encoding: "utf8" });
    } catch (err) {
      logError("Failed to open log file stream.", err);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  try {
    while (!isDone) {
      // Check if we hit the limit
      if (limit && totalProcessed >= limit) {
        log(`Reached configured limit of ${limit} records. Stopping.`);
        break;
      }

      const currentBatchSize = limit 
        ? Math.min(batchSize, limit - totalProcessed) 
        : batchSize;

      if (currentBatchSize <= 0) break;

      // Query messages order by ID ascending where businessId is null
      const query: any = {
        where: {
          businessId: null
        },
        select: {
          id: true,
          leadId: true,
          businessId: true
        },
        orderBy: {
          id: "asc"
        },
        take: currentBatchSize
      };

      if (lastProcessedId) {
        query.where.id = { gt: lastProcessedId };
      }

      const batchStartTime = Date.now();
      let messages: { id: string; leadId: string; businessId: string | null }[] = [];
      try {
        messages = await prisma.message.findMany(query);
      } catch (err) {
        logError("Failed to fetch messages batch.", err);
        break;
      }

      if (messages.length === 0) {
        log("No more records found to process.");
        isDone = true;
        break;
      }

      // Resolve businessIds using shared batch utility
      const leadIds = messages.map(msg => msg.leadId).filter(Boolean);
      let batchInfo = { exists: new Set<string>(), businessIds: {} as Record<string, string> };

      try {
        batchInfo = await getLeadsBatchInfo(prisma, leadIds);
      } catch (err) {
        logError("Failed to resolve batch lead information.", err);
        break;
      }

      // Process the batch
      const updatesMap: Record<string, string[]> = {}; // businessId -> Array of message IDs
      let batchUpdated = 0;
      let batchFailed = 0;
      let batchSkipped = 0;

      for (const msg of messages) {
        const messageId = msg.id;
        const leadId = msg.leadId;

        if (!leadId || !batchInfo.exists.has(leadId)) {
          // Orphan message (Lead not found in DB)
          batchFailed++;
          orphanMessageIds.push(messageId);
          continue;
        }

        const targetBusinessId = batchInfo.businessIds[leadId];

        if (!targetBusinessId) {
          // Lead exists but does not have a business ID
          batchFailed++;
          failedLeadIds.add(leadId);
          continue;
        }

        // Needs update
        if (!updatesMap[targetBusinessId]) {
          updatesMap[targetBusinessId] = [];
        }
        updatesMap[targetBusinessId].push(messageId);
        batchUpdated++;
      }

      // Apply updates if not dry-run
      if (!dryRun && batchUpdated > 0) {
        try {
          for (const [bizId, msgIds] of Object.entries(updatesMap)) {
            await prisma.message.updateMany({
              where: {
                id: { in: msgIds }
              },
              data: {
                businessId: bizId
              }
            });

            // Write updated IDs to surgical rollback log
            if (logStream) {
              for (const id of msgIds) {
                logStream.write(`${id}\n`);
              }
            }
          }
        } catch (err) {
          logError("Failed to apply batch updates. Retrying individually...", err);
          // Fall back to individual updates to isolate failures
          for (const [bizId, msgIds] of Object.entries(updatesMap)) {
            for (const msgId of msgIds) {
              try {
                await prisma.message.update({
                  where: { id: msgId },
                  data: { businessId: bizId }
                });
                if (logStream) {
                  logStream.write(`${msgId}\n`);
                }
              } catch (singleErr: any) {
                logError(`Failed to update message ${msgId}`, singleErr);
                batchUpdated--;
                batchFailed++;
                if (dbWriteErrors.length < 500) {
                  dbWriteErrors.push({ messageId: msgId, error: singleErr.message });
                }
              }
            }
          }
        }
      }

      // Update statistics
      totalProcessed += messages.length;
      totalUpdated += batchUpdated;
      totalFailed += batchFailed;
      totalSkipped += batchSkipped;
      lastProcessedId = messages[messages.length - 1].id;

      // Save progress to progress file
      if (!dryRun) {
        try {
          fs.writeFileSync(
            progressFilePath,
            JSON.stringify({
              lastProcessedId,
              totalProcessed,
              totalUpdated,
              totalFailed,
              totalSkipped,
              updatedAt: new Date().toISOString()
            }, null, 2),
            "utf8"
          );
        } catch (err) {
          logError("Failed to save progress to file.", err);
        }
      }

      // Progress reporting & ETA estimation
      const elapsedSec = (Date.now() - startTime) / 1000;
      const speed = totalProcessed / elapsedSec; // rec/sec
      let etaStr = "Calculating...";
      if (speed > 0) {
        const remaining = totalPending - totalProcessed;
        const etaSec = remaining / speed;
        if (etaSec <= 0) {
          etaStr = "0s";
        } else {
          const hrs = Math.floor(etaSec / 3600);
          const mins = Math.floor((etaSec % 3600) / 60);
          const secs = Math.floor(etaSec % 60);
          etaStr = hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
        }
      }

      const pct = totalPending > 0 ? ((totalProcessed / totalPending) * 100).toFixed(1) : "100.0";
      log(`[Progress] ${totalProcessed}/${totalPending} (${pct}%) | Speed: ${speed.toFixed(1)} rec/s | ETA: ${etaStr} | Updated: ${totalUpdated} | Failed: ${totalFailed}`);
    }
  } finally {
    if (logStream) {
      logStream.end();
    }
  }

  // Print Validation Report
  const totalDurationSec = (Date.now() - startTime) / 1000;
  console.log("\n");
  console.log("=========================================================");
  console.log("                VALIDATION & SUMMARY REPORT              ");
  console.log("=========================================================");
  console.log(`Execution Mode:          ${dryRun ? "DRY-RUN (SIMULATION)" : "LIVE EXECUTION"}`);
  console.log(`Total Messages in DB:    ${totalMessages}`);
  console.log(`Needing Backfill:        ${totalPending}`);
  console.log(`Processed in this run:   ${totalProcessed}`);
  console.log(`Successfully Updated:    ${totalUpdated}`);
  console.log(`Failed / Skipped:        ${totalFailed}`);
  console.log(`Orphan Messages (No Lead): ${orphanMessageIds.length}`);
  console.log(`Leads Missing businessId:  ${failedLeadIds.size}`);
  console.log(`Database Write Errors:     ${dbWriteErrors.length}`);
  console.log(`Total Time Elapsed:      ${totalDurationSec.toFixed(2)} seconds`);
  if (totalProcessed > 0) {
    console.log(`Average Throughput:      ${(totalProcessed / totalDurationSec).toFixed(2)} records/second`);
  }
  console.log("=========================================================");

  if (orphanMessageIds.length > 0) {
    console.log("\n[WARNING] Orphan Messages (first 10):");
    console.log(orphanMessageIds.slice(0, 10));
  }

  if (failedLeadIds.size > 0) {
    console.log("\n[WARNING] Leads with missing businessId (first 10):");
    console.log(Array.from(failedLeadIds).slice(0, 10));
  }

  // Create validation report markdown file
  const reportPath = path.resolve(__dirname, `backfill-report-${Date.now()}.md`);
  const reportContent = `# Message.businessId Backfill Migration Report
- **Date**: ${new Date().toISOString()}
- **Mode**: ${dryRun ? "DRY-RUN (SIMULATION)" : "LIVE EXECUTION"}
- **Total Messages in DB**: ${totalMessages}
- **Messages Needing Backfill**: ${totalPending}
- **Processed in this run**: ${totalProcessed}
- **Successfully Updated**: ${totalUpdated}
- **Failed**: ${totalFailed}
- **Orphan Messages (No Lead)**: ${orphanMessageIds.length}
- **Leads Missing businessId**: ${failedLeadIds.size}
- **Database Write Errors**: ${dbWriteErrors.length}
- **Total Duration**: ${totalDurationSec.toFixed(2)}s
- **Average Speed**: ${totalProcessed > 0 ? (totalProcessed / totalDurationSec).toFixed(2) : 0} rec/s

## Error/Warning Details
- **Orphan Messages**: ${orphanMessageIds.length} detected (messages whose leadId does not resolve to an active Lead).
- **Leads Missing businessId**: ${failedLeadIds.size} leads found with null or undefined businessId.
- **Prisma/DB Errors**: ${dbWriteErrors.length} write errors.

## Verification / Dry-Run Result
${dryRun ? "This run was a **DRY-RUN**. No records were written to the database. Run the script with \`--execute\` to apply the updates." : "This run was a **LIVE EXECUTION**. Updates were written to the database."}
`;

  try {
    fs.writeFileSync(reportPath, reportContent, "utf8");
    log(`Saved validation markdown report to: ${reportPath}`);
  } catch (err) {
    logError("Failed to write markdown report file.", err);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  logError("Fatal error during execution.", err);
  await prisma.$disconnect();
  process.exit(1);
});
