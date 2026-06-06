import { Worker } from "worker_threads";

/**
 * Verifies a password against a hash in a background worker thread.
 */
export const verifyPasswordWorker = (password: string, hash: string): Promise<boolean> => {
  const libName = process.env.AUTH_NATIVE_BCRYPT_ENABLED === "false" ? "bcryptjs" : "bcrypt";
  return new Promise((resolve) => {
    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const bcrypt = require('${libName}');
      bcrypt.compare(workerData.password, workerData.hash, (err, res) => {
        parentPort.postMessage({ success: !err && res });
      });
    `;

    let resolved = false;
    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { password, hash },
    });

    worker.on("message", (msg) => {
      resolved = true;
      resolve(Boolean(msg?.success));
      worker.terminate().catch(() => {});
    });

    worker.on("error", (err) => {
      console.error("Bcrypt compare worker error:", err);
      resolved = true;
      resolve(false);
      worker.terminate().catch(() => {});
    });

    worker.on("exit", (code) => {
      if (!resolved) {
        resolve(false);
      }
    });
  });
};

/**
 * Hashes a password in a background worker thread.
 */
export const hashPasswordWorker = (password: string, rounds = 12): Promise<string> => {
  const libName = process.env.AUTH_NATIVE_BCRYPT_ENABLED === "false" ? "bcryptjs" : "bcrypt";
  return new Promise((resolve, reject) => {
    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      const bcrypt = require('${libName}');
      bcrypt.hash(workerData.password, workerData.rounds, (err, res) => {
        if (err) {
          parentPort.postMessage({ error: err.message });
        } else {
          parentPort.postMessage({ hash: res });
        }
      });
    `;

    let resolved = false;
    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { password, rounds },
    });

    worker.on("message", (msg) => {
      resolved = true;
      if (msg?.error) {
        reject(new Error(msg.error));
      } else {
        resolve(String(msg?.hash));
      }
      worker.terminate().catch(() => {});
    });

    worker.on("error", (err) => {
      console.error("Bcrypt hash worker error:", err);
      resolved = true;
      reject(err);
      worker.terminate().catch(() => {});
    });

    worker.on("exit", (code) => {
      if (!resolved) {
        reject(new Error("Worker exited without returning a hash"));
      }
    });
  });
};
