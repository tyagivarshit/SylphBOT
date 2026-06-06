import { Worker } from "worker_threads";

/**
 * Gets the actual bcrypt library to be used at runtime (checking env flag and loading availability).
 */
export const getBcryptLibraryName = (): "bcrypt" | "bcryptjs" => {
  const libName = process.env.AUTH_NATIVE_BCRYPT_ENABLED === "false" ? "bcryptjs" : "bcrypt";
  try {
    require(libName);
    return libName as "bcrypt" | "bcryptjs";
  } catch (e) {
    return "bcryptjs";
  }
};

/**
 * Verifies a password against a hash in a background worker thread.
 */
export const verifyPasswordWorker = (password: string, hash: string): Promise<boolean> => {
  const libName = getBcryptLibraryName();

  console.log(`AUTH_PASSWORD_PROVIDER {\n  provider: ${libName}\n}`);

  return new Promise((resolve) => {
    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      try {
        const bcrypt = require('${libName}');
        bcrypt.compare(workerData.password, workerData.hash, (err, res) => {
          parentPort.postMessage({ success: !err && res });
        });
      } catch (err) {
        parentPort.postMessage({ error: err.message });
      }
    `;

    let resolved = false;

    const fallbackToMainThread = () => {
      if (resolved) return;
      resolved = true;
      try {
        const bcrypt = require(libName);
        bcrypt.compare(password, hash, (err: any, res: boolean) => {
          resolve(!err && res);
        });
      } catch (fallbackErr) {
        resolve(false);
      }
    };

    let worker: Worker;
    try {
      worker = new Worker(workerCode, {
        eval: true,
        workerData: { password, hash },
      });

      worker.on("message", (msg) => {
        if (resolved) return;
        resolved = true;
        if (msg?.error) {
          fallbackToMainThread();
        } else {
          resolve(Boolean(msg?.success));
        }
        worker.terminate().catch(() => {});
      });

      worker.on("error", (err) => {
        fallbackToMainThread();
        worker.terminate().catch(() => {});
      });

      worker.on("exit", (code) => {
        if (!resolved) {
          fallbackToMainThread();
        }
      });
    } catch (workerError) {
      fallbackToMainThread();
    }
  });
};

/**
 * Hashes a password in a background worker thread.
 */
export const hashPasswordWorker = (password: string, rounds = 12): Promise<string> => {
  const libName = getBcryptLibraryName();

  return new Promise((resolve, reject) => {
    const workerCode = `
      const { parentPort, workerData } = require('worker_threads');
      try {
        const bcrypt = require('${libName}');
        bcrypt.hash(workerData.password, workerData.rounds, (err, res) => {
          if (err) {
            parentPort.postMessage({ error: err.message });
          } else {
            parentPort.postMessage({ hash: res });
          }
        });
      } catch (err) {
        parentPort.postMessage({ error: err.message });
      }
    `;

    let resolved = false;

    const fallbackToMainThread = () => {
      if (resolved) return;
      resolved = true;
      try {
        const bcrypt = require(libName);
        bcrypt.hash(password, rounds, (err: any, res: string) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      } catch (fallbackErr) {
        reject(fallbackErr);
      }
    };

    let worker: Worker;
    try {
      worker = new Worker(workerCode, {
        eval: true,
        workerData: { password, rounds },
      });

      worker.on("message", (msg) => {
        if (resolved) return;
        resolved = true;
        if (msg?.error) {
          fallbackToMainThread();
        } else {
          resolve(String(msg?.hash));
        }
        worker.terminate().catch(() => {});
      });

      worker.on("error", (err) => {
        fallbackToMainThread();
        worker.terminate().catch(() => {});
      });

      worker.on("exit", (code) => {
        if (!resolved) {
          fallbackToMainThread();
        }
      });
    } catch (workerError) {
      fallbackToMainThread();
    }
  });
};
