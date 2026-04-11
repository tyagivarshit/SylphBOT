import "./ai.partition.worker";

// Backward-compatible bootstrap entry.
// Local commands may still target `src/workers/ai.worker.ts`,
// so this file now forwards to the enterprise partitioned worker runtime.
export {};
