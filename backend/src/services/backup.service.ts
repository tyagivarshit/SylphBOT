import logger from "../utils/logger";

type BackupConfig = {
  provider: string;
  bucket: string | null;
  schedule: string | null;
  enabled: boolean;
};

const getBackupConfig = (): BackupConfig => {
  const provider = String(process.env.BACKUP_PROVIDER || "stub").trim() || "stub";
  const bucket = String(process.env.BACKUP_BUCKET || "").trim() || null;
  const schedule = String(process.env.BACKUP_SCHEDULE || "").trim() || null;

  return {
    provider,
    bucket,
    schedule,
    enabled: provider !== "stub" || Boolean(bucket),
  };
};

export const getBackupStatus = () => {
  const config = getBackupConfig();

  return {
    ...config,
    restoreRunbook: "backend/docs/backup-restore.md",
  };
};

export const triggerBackup = async (input: {
  requestedByUserId: string;
  businessId: string;
}) => {
  const config = getBackupConfig();
  const acceptedAt = new Date().toISOString();

  logger.info(
    {
      requestedByUserId: input.requestedByUserId,
      businessId: input.businessId,
      provider: config.provider,
      bucket: config.bucket,
      enabled: config.enabled,
      acceptedAt,
    },
    "Backup trigger requested"
  );

  return {
    success: true,
    provider: config.provider,
    enabled: config.enabled,
    acceptedAt,
    mode: "manual",
  };
};
