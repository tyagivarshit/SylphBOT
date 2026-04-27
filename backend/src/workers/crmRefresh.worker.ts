import { closeCRMRefreshQueue, initCRMRefreshWorker } from "../services/crm/refreshQueue.service";
import { processQueuedLeadIntelligenceRefresh } from "../services/crm/leadIntelligence.service";

export const startCRMRefreshWorker = () => {
  const worker = initCRMRefreshWorker({
    processor: processQueuedLeadIntelligenceRefresh,
  });

  if (!worker) {
    console.log("[crmRefresh.worker] RUN_WORKER disabled, worker not started");
  }

  return worker;
};

export const stopCRMRefreshWorker = async () => {
  await closeCRMRefreshQueue();
};
