#!/usr/bin/env node
/* eslint-disable no-console */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const SCHEMA_PATH = path.resolve(__dirname, "..", "prisma", "schema.prisma");
const ARCHIVE_COLLECTION = "_canonical_dedupe_archive";
const AUDIT_COLLECTION = "_canonical_dedupe_audit";
const SCRIPT_VERSION = "canonical-dedupe.v1";

const SCALAR_TYPES = new Set([
  "String",
  "Boolean",
  "Int",
  "Float",
  "Decimal",
  "BigInt",
  "DateTime",
  "Json",
  "Bytes",
  "Unsupported",
]);

const INACTIVE_STATUSES = new Set([
  "INACTIVE",
  "DISABLED",
  "REVOKED",
  "DELETED",
  "ARCHIVED",
  "TOMBSTONED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "DISCONNECTED",
  "SUPERSEDED",
  "ROLLED_BACK",
  "VOID",
  "CLOSED",
  "LOST",
]);

const prisma = new PrismaClient();

const lowerFirst = (value) =>
  value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;

const stableHash = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const normalizeString = (value) => String(value || "").trim();

const parseDateMs = (value) => {
  if (!value) {
    return 0;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const toRecord = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const parseBracketList = (raw) => {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .map((part) => part.replace(/\(.+\)/, "").trim())
    .map((part) => part.replace(/^["'`]|["'`]$/g, "").trim())
    .filter(Boolean);
};

const serializeValue = (value) => {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (value instanceof Date) {
    return `date:${value.toISOString()}`;
  }
  if (typeof value === "object") {
    return `json:${JSON.stringify(value)}`;
  }
  return `${typeof value}:${String(value)}`;
};

const parseSchema = (schemaText) => {
  const lines = schemaText.split(/\r?\n/);
  const models = {};
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const modelStart = line.match(/^model\s+([A-Za-z0-9_]+)\s+\{$/);
    if (modelStart) {
      current = {
        name: modelStart[1],
        fields: {},
        uniqueConstraints: [],
        relations: [],
      };
      models[current.name] = current;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line === "}") {
      current = null;
      continue;
    }

    if (!line || line.startsWith("//")) {
      continue;
    }

    const uniqueMatch = line.match(/^@@unique\(\s*\[([^\]]+)\]/);
    if (uniqueMatch) {
      const fields = parseBracketList(uniqueMatch[1]);
      if (fields.length > 0) {
        current.uniqueConstraints.push(fields);
      }
      continue;
    }

    if (line.startsWith("@@")) {
      continue;
    }

    const fieldMatch = line.match(/^([A-Za-z0-9_]+)\s+([^\s]+)\s*(.*)$/);
    if (!fieldMatch) {
      continue;
    }

    const fieldName = fieldMatch[1];
    const fieldTypeRaw = fieldMatch[2];
    const attributes = fieldMatch[3] || "";
    const scalar = fieldTypeRaw.replace(/\?|\[\]/g, "");
    const optional = fieldTypeRaw.endsWith("?");
    const list = fieldTypeRaw.endsWith("[]");

    current.fields[fieldName] = {
      name: fieldName,
      scalar,
      optional,
      list,
      rawType: fieldTypeRaw,
      attributes,
    };

    if (attributes.includes("@unique")) {
      current.uniqueConstraints.push([fieldName]);
    }

    const relationMatch = attributes.match(/@relation\(([^)]*)\)/);
    if (relationMatch) {
      const relationBody = relationMatch[1];
      const relationFields = parseBracketList(
        relationBody.match(/fields:\s*\[([^\]]+)\]/)?.[1]
      );
      const relationRefs = parseBracketList(
        relationBody.match(/references:\s*\[([^\]]+)\]/)?.[1]
      );
      const targetModel = scalar;
      if (
        relationFields.length > 0 &&
        relationRefs.includes("id") &&
        !SCALAR_TYPES.has(targetModel)
      ) {
        for (const sourceField of relationFields) {
          current.relations.push({
            sourceModel: current.name,
            sourceField,
            targetModel,
            targetField: "id",
          });
        }
      }
    }
  }

  for (const model of Object.values(models)) {
    const deduped = new Map();
    for (const unique of model.uniqueConstraints) {
      const key = unique.join("|");
      if (!deduped.has(key)) {
        deduped.set(key, unique);
      }
    }
    model.uniqueConstraints = Array.from(deduped.values());
  }

  return models;
};

const buildRelationMap = (models) => {
  const relationMap = {};
  for (const model of Object.values(models)) {
    for (const relation of model.relations || []) {
      if (!relationMap[relation.targetModel]) {
        relationMap[relation.targetModel] = [];
      }
      relationMap[relation.targetModel].push({
        sourceModel: relation.sourceModel,
        sourceField: relation.sourceField,
      });
    }
  }
  return relationMap;
};

const buildSelect = (modelDef, fields) => {
  const select = {};
  for (const field of fields) {
    if (modelDef.fields[field]) {
      select[field] = true;
    }
  }
  return select;
};

const computeAuthoritativeScore = (row) => {
  const metadata = toRecord(row.metadata);
  const dedupeMeta = toRecord(metadata.canonicalDedupe);
  const status = normalizeString(row.status).toUpperCase();
  let score = 0;

  if (row.isCanonical === true) {
    score += 4;
  }
  if (row.isActive === true) {
    score += 3;
  }
  if (status && !INACTIVE_STATUSES.has(status)) {
    score += 2;
  }
  if (metadata.authoritative === true) {
    score += 2;
  }
  if (metadata.source === "SYSTEM") {
    score += 1;
  }
  if (dedupeMeta.tombstoned === true) {
    score -= 100;
  }

  return score;
};

const chooseSurvivor = (rows) => {
  const sorted = [...rows].sort((left, right) => {
    const leftScore = computeAuthoritativeScore(left);
    const rightScore = computeAuthoritativeScore(right);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    const leftVersion = Number.isFinite(Number(left.version))
      ? Number(left.version)
      : 0;
    const rightVersion = Number.isFinite(Number(right.version))
      ? Number(right.version)
      : 0;
    if (leftVersion !== rightVersion) {
      return rightVersion - leftVersion;
    }

    const leftUpdated = parseDateMs(left.updatedAt);
    const rightUpdated = parseDateMs(right.updatedAt);
    if (leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated;
    }

    const leftCreated = parseDateMs(left.createdAt);
    const rightCreated = parseDateMs(right.createdAt);
    if (leftCreated !== rightCreated) {
      return rightCreated - leftCreated;
    }

    return String(right.id).localeCompare(String(left.id));
  });

  return {
    survivor: sorted[0],
    losers: sorted.slice(1),
  };
};

const buildCollisionGroups = (rows, fields) => {
  const groups = new Map();
  for (const row of rows) {
    const key = fields.map((field) => serializeValue(row[field])).join("|");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }

  return Array.from(groups.entries())
    .filter(([, bucket]) => bucket.length > 1)
    .map(([collisionKey, bucket]) => ({
      collisionKey,
      rows: bucket,
    }));
};

const readAuditOperation = async (operationKey) => {
  const response = await prisma.$runCommandRaw({
    find: AUDIT_COLLECTION,
    filter: { operationKey },
    limit: 1,
  });
  const rows = response?.cursor?.firstBatch || [];
  return rows[0] || null;
};

const writeAuditOperation = async (operationKey, payload) => {
  const timestamp = new Date();
  await prisma.$runCommandRaw({
    update: AUDIT_COLLECTION,
    updates: [
      {
        q: { operationKey },
        u: {
          $setOnInsert: {
            operationKey,
            createdAt: timestamp,
            scriptVersion: SCRIPT_VERSION,
          },
          $set: {
            ...payload,
            updatedAt: timestamp,
          },
        },
        upsert: true,
      },
    ],
    ordered: true,
  });
};

const archiveLoserRow = async ({
  modelName,
  operationKey,
  constraintFields,
  collisionKey,
  loser,
  survivor,
  fullRow,
}) => {
  const archiveKey = `archive:${modelName}:${String(loser.id)}`;
  const timestamp = new Date();
  await prisma.$runCommandRaw({
    update: ARCHIVE_COLLECTION,
    updates: [
      {
        q: { archiveKey },
        u: {
          $setOnInsert: {
            archiveKey,
            modelName,
            loserId: loser.id,
            survivorId: survivor.id,
            operationKey,
            constraintFields,
            collisionKey,
            originalRow: fullRow,
            archivedAt: timestamp,
            createdAt: timestamp,
            scriptVersion: SCRIPT_VERSION,
          },
          $set: {
            operationKey,
            survivorId: survivor.id,
            updatedAt: timestamp,
          },
        },
        upsert: true,
      },
    ],
    ordered: true,
  });
};

const buildTombstoneValue = ({
  modelName,
  fieldName,
  operationKey,
  rowId,
  currentValue,
}) => {
  const normalized = normalizeString(currentValue);
  const base = normalized || `${modelName.toLowerCase()}:${fieldName}:empty`;
  const suffix = `${operationKey.slice(0, 12)}:${String(rowId).slice(-6)}`;
  return `${base}#tombstone:${suffix}`;
};

const buildNumericTombstone = (operationKey, fieldName, rowId) => {
  const hash = stableHash([operationKey, fieldName, rowId]);
  const raw = parseInt(hash.slice(0, 12), 16);
  return Math.abs(raw % 2000000000);
};

const buildTombstonePatch = ({
  modelDef,
  row,
  allUniqueFields,
  operationKey,
  survivorId,
  constraintFields,
  collisionKey,
}) => {
  const patch = {};
  for (const field of allUniqueFields) {
    if (field === "id") {
      continue;
    }
    const fieldDef = modelDef.fields[field];
    if (!fieldDef) {
      continue;
    }
    if (fieldDef.scalar === "String") {
      patch[field] = buildTombstoneValue({
        modelName: modelDef.name,
        fieldName: field,
        operationKey,
        rowId: row.id,
        currentValue: row[field],
      });
      continue;
    }
    if (fieldDef.scalar === "DateTime") {
      if (fieldDef.optional) {
        patch[field] = null;
      } else {
        patch[field] = new Date(0);
      }
      continue;
    }
    if (
      fieldDef.scalar === "Int" ||
      fieldDef.scalar === "Float" ||
      fieldDef.scalar === "Decimal" ||
      fieldDef.scalar === "BigInt"
    ) {
      if (fieldDef.optional) {
        patch[field] = null;
      } else {
        patch[field] = buildNumericTombstone(operationKey, field, row.id);
      }
      continue;
    }
    if (fieldDef.optional) {
      patch[field] = null;
      continue;
    }
    throw new Error(
      `unsupported_unique_tombstone:${modelDef.name}.${field}:${fieldDef.rawType}`
    );
  }

  if (modelDef.fields.status?.scalar === "String") {
    patch.status = "TOMBSTONED";
  }
  if (modelDef.fields.isActive?.scalar === "Boolean") {
    patch.isActive = false;
  }
  if (modelDef.fields.updatedAt?.scalar === "DateTime") {
    patch.updatedAt = new Date();
  }
  if (modelDef.fields.metadata) {
    patch.metadata = {
      ...toRecord(row.metadata),
      canonicalDedupe: {
        tombstoned: true,
        operationKey,
        survivorId,
        modelName: modelDef.name,
        constraintFields,
        collisionKey,
        mergedAt: new Date().toISOString(),
        scriptVersion: SCRIPT_VERSION,
      },
    };
  }

  return patch;
};

const mergeReferences = async ({
  relationMap,
  targetModelName,
  loserId,
  survivorId,
}) => {
  let updated = 0;
  const refs = relationMap[targetModelName] || [];
  for (const ref of refs) {
    const delegate = prisma[lowerFirst(ref.sourceModel)];
    if (!delegate?.updateMany) {
      continue;
    }
    try {
      const result = await delegate.updateMany({
        where: {
          [ref.sourceField]: loserId,
        },
        data: {
          [ref.sourceField]: survivorId,
        },
      });
      updated += Number(result?.count || 0);
    } catch (error) {
      throw new Error(
        `reference_merge_failed:${ref.sourceModel}.${ref.sourceField}:${String(
          error?.message || error
        )}`
      );
    }
  }
  return updated;
};

const dedupeModelConstraint = async ({
  modelDef,
  uniqueFields,
  relationMap,
}) => {
  const delegate = prisma[lowerFirst(modelDef.name)];
  if (!delegate?.findMany) {
    return {
      scannedRows: 0,
      duplicateGroups: 0,
      mergedGroups: 0,
      skippedGroups: 0,
      tombstonedRows: 0,
      archivedRows: 0,
      updatedReferences: 0,
      operations: [],
    };
  }

  const supportFields = ["id", "metadata", "version", "updatedAt", "createdAt", "status", "isActive", "isCanonical"];
  const requiredSelectFields = Array.from(
    new Set([...uniqueFields, ...supportFields])
  );

  const rows = await delegate.findMany({
    select: buildSelect(modelDef, requiredSelectFields),
  });

  const groups = buildCollisionGroups(rows, uniqueFields);
  const allUniqueFields = Array.from(
    new Set(
      modelDef.uniqueConstraints.flatMap((constraint) =>
        constraint.filter((field) => field !== "id")
      )
    )
  );

  const summary = {
    scannedRows: rows.length,
    duplicateGroups: groups.length,
    mergedGroups: 0,
    skippedGroups: 0,
    tombstonedRows: 0,
    archivedRows: 0,
    updatedReferences: 0,
    operations: [],
  };

  for (const group of groups) {
    const { survivor, losers } = chooseSurvivor(group.rows);
    if (!survivor || losers.length === 0) {
      continue;
    }

    const operationKey = `merge:${stableHash({
      modelName: modelDef.name,
      uniqueFields,
      collisionKey: group.collisionKey,
      survivorId: survivor.id,
      loserIds: losers.map((row) => row.id).sort(),
    })}`;

    const existingAudit = await readAuditOperation(operationKey);
    if (existingAudit?.status === "COMPLETED") {
      summary.skippedGroups += 1;
      summary.operations.push({
        operationKey,
        status: "SKIPPED",
        reason: "already_completed",
      });
      continue;
    }

    await writeAuditOperation(operationKey, {
      status: "RUNNING",
      modelName: modelDef.name,
      constraintFields: uniqueFields,
      collisionKey: group.collisionKey,
      survivorId: survivor.id,
      loserIds: losers.map((row) => row.id),
      startedAt: new Date(),
    });

    try {
      let archivedCount = 0;
      let tombstonedCount = 0;
      let referenceUpdateCount = 0;

      for (const loser of losers) {
        const fullLoser =
          (await delegate
            .findUnique({
              where: { id: loser.id },
            })
            .catch(() => null)) || loser;

        await archiveLoserRow({
          modelName: modelDef.name,
          operationKey,
          constraintFields: uniqueFields,
          collisionKey: group.collisionKey,
          loser,
          survivor,
          fullRow: fullLoser,
        });
        archivedCount += 1;

        const updatedRefs = await mergeReferences({
          relationMap,
          targetModelName: modelDef.name,
          loserId: loser.id,
          survivorId: survivor.id,
        });
        referenceUpdateCount += updatedRefs;

        const patch = buildTombstonePatch({
          modelDef,
          row: fullLoser,
          allUniqueFields,
          operationKey,
          survivorId: survivor.id,
          constraintFields: uniqueFields,
          collisionKey: group.collisionKey,
        });

        await delegate.update({
          where: { id: loser.id },
          data: patch,
        });
        tombstonedCount += 1;
      }

      summary.mergedGroups += 1;
      summary.tombstonedRows += tombstonedCount;
      summary.archivedRows += archivedCount;
      summary.updatedReferences += referenceUpdateCount;
      summary.operations.push({
        operationKey,
        status: "COMPLETED",
        survivorId: survivor.id,
        loserIds: losers.map((row) => row.id),
        archivedCount,
        tombstonedCount,
        referenceUpdateCount,
      });

      await writeAuditOperation(operationKey, {
        status: "COMPLETED",
        modelName: modelDef.name,
        constraintFields: uniqueFields,
        collisionKey: group.collisionKey,
        survivorId: survivor.id,
        loserIds: losers.map((row) => row.id),
        archivedCount,
        tombstonedCount,
        referenceUpdateCount,
        completedAt: new Date(),
      });
    } catch (error) {
      await writeAuditOperation(operationKey, {
        status: "FAILED",
        modelName: modelDef.name,
        constraintFields: uniqueFields,
        collisionKey: group.collisionKey,
        survivorId: survivor.id,
        loserIds: losers.map((row) => row.id),
        error: String(error?.message || error),
        failedAt: new Date(),
      });
      throw error;
    }
  }

  return summary;
};

const run = async () => {
  const startedAt = Date.now();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for canonical dedupe.");
  }

  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  const models = parseSchema(schema);
  const relationMap = buildRelationMap(models);
  const ledgerModels = Object.values(models).filter(
    (model) =>
      model.name.endsWith("Ledger") &&
      Array.isArray(model.uniqueConstraints) &&
      model.uniqueConstraints.length > 0
  );

  const totals = {
    ledgerModelsScanned: ledgerModels.length,
    constraintsScanned: 0,
    duplicateGroups: 0,
    mergedGroups: 0,
    skippedGroups: 0,
    tombstonedRows: 0,
    archivedRows: 0,
    updatedReferences: 0,
    scannedRows: 0,
  };

  const report = [];

  await prisma.$connect();
  try {
    for (const modelDef of ledgerModels) {
      const modelEntry = {
        model: modelDef.name,
        constraints: [],
      };
      for (const uniqueFields of modelDef.uniqueConstraints) {
        totals.constraintsScanned += 1;
        const result = await dedupeModelConstraint({
          modelDef,
          uniqueFields,
          relationMap,
        });
        totals.scannedRows += result.scannedRows;
        totals.duplicateGroups += result.duplicateGroups;
        totals.mergedGroups += result.mergedGroups;
        totals.skippedGroups += result.skippedGroups;
        totals.tombstonedRows += result.tombstonedRows;
        totals.archivedRows += result.archivedRows;
        totals.updatedReferences += result.updatedReferences;

        modelEntry.constraints.push({
          uniqueFields,
          scannedRows: result.scannedRows,
          duplicateGroups: result.duplicateGroups,
          mergedGroups: result.mergedGroups,
          skippedGroups: result.skippedGroups,
          tombstonedRows: result.tombstonedRows,
          archivedRows: result.archivedRows,
          updatedReferences: result.updatedReferences,
        });
      }
      report.push(modelEntry);
    }

    const elapsedMs = Date.now() - startedAt;
    const output = {
      ok: true,
      scriptVersion: SCRIPT_VERSION,
      elapsedMs,
      totals,
      report,
    };
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await prisma.$disconnect();
  }
};

run().catch(async (error) => {
  try {
    await prisma.$disconnect();
  } catch {
    // no-op
  }
  console.error(
    JSON.stringify(
      {
        ok: false,
        scriptVersion: SCRIPT_VERSION,
        error: String(error?.message || error),
      },
      null,
      2
    )
  );
  process.exit(1);
});

