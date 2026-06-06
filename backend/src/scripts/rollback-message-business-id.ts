#!/usr/bin/env node
/* eslint-disable no-console */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const prisma = new PrismaClient();

// Configuration
const DEFAULT_UPDATED_IDS_FILE = path.resolve(__dirname, "backfilled-message-ids.log");
const DEFAULT_BATCH_SIZE = 1000;

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");

const batchSizeArg = args.find(arg => arg.startsWith("--batch-size="));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split("=")[1], 10) : DEFAULT_BATCH_SIZE;

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
  log("MESSAGE BUSINESS ID ROLLBACK SCRIPT (TYPESCRIPT)");
  log(`Mode: ${dryRun ? "DRY-RUN (No database writes)" : "EXECUTE (Live database writes)"}`);
  log(`Batch Size: ${batchSize}`);
  log(`Log File: ${logFilePath}`);
  log("=========================================================");

  if (!fs.existsSync(logFilePath)) {
    logError(`Log file not found: ${logFilePath}`);
    log("Nothing to rollback.");
    process.exit(1);
  }

  // Read the list of IDs to roll back
  let ids: string[] = [];
  try {
    const content = fs.readFileSync(logFilePath, "utf8");
    ids = content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (err) {
    logError("Failed to read log file.", err);
    process.exit(1);
  }

  log(`Loaded ${ids.length} message IDs to roll back.`);

  if (ids.length === 0) {
    log("No message IDs found to rollback.");
    process.exit(0);
  }

  // Connect to Prisma
  try {
    await prisma.$connect();
    log("Successfully connected to the database.");
  } catch (err) {
    logError("Failed to connect to the database.", err);
    process.exit(1);
  }

  const startTime = Date.now();
  let totalProcessed = 0;
  let totalRolledBack = 0;
  let totalFailed = 0;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batchIds = ids.slice(i, i + batchSize);
    const batchStartTime = Date.now();

    if (!dryRun) {
      try {
        const updateResult = await prisma.message.updateMany({
          where: {
            id: { in: batchIds }
          },
          data: {
            businessId: null
          }
        });
        totalRolledBack += updateResult.count;
      } catch (err) {
        logError(`Failed to roll back batch starting at index ${i}. Retrying individually...`, err);
        for (const id of batchIds) {
          try {
            await prisma.message.update({
              where: { id },
              data: { businessId: null }
            });
            totalRolledBack++;
          } catch (singleErr) {
            logError(`Failed to rollback message ${id}`, singleErr);
            totalFailed++;
          }
        }
      }
    } else {
      totalRolledBack += batchIds.length;
    }

    totalProcessed += batchIds.length;

    // Log progress
    const elapsedSec = (Date.now() - startTime) / 1000;
    const speed = totalProcessed / elapsedSec;
    let etaStr = "Calculating...";
    if (speed > 0) {
      const remaining = ids.length - totalProcessed;
      const etaSec = remaining / speed;
      if (etaSec <= 0) {
        etaStr = "0s";
      } else {
        const mins = Math.floor(etaSec / 60);
        const secs = Math.floor(etaSec % 60);
        etaStr = `${mins}m ${secs}s`;
      }
    }

    const pct = ((totalProcessed / ids.length) * 100).toFixed(1);
    log(`[Progress] ${totalProcessed}/${ids.length} (${pct}%) | Speed: ${speed.toFixed(1)} rec/s | ETA: ${etaStr} | Rolled back: ${totalRolledBack} | Failed: ${totalFailed}`);
  }

  const durationSec = (Date.now() - startTime) / 1000;
  log("=========================================================");
  log("ROLLBACK RUN COMPLETED");
  log(`Execution Mode:          ${dryRun ? "DRY-RUN (SIMULATION)" : "LIVE EXECUTION"}`);
  log(`Total IDs Processed:     ${totalProcessed}`);
  log(`Successfully Rolled Back:${totalRolledBack}`);
  log(`Failed:                  ${totalFailed}`);
  log(`Total Time Elapsed:      ${durationSec.toFixed(2)} seconds`);
  log("=========================================================");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  logError("Fatal error during rollback execution.", err);
  await prisma.$disconnect();
  process.exit(1);
});
