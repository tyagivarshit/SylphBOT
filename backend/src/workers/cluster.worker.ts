import cluster from "cluster";
import { getWorkerCount } from "./workerManager";

export const startWorkerCluster = () => {

  if (cluster.isPrimary) {

    const workers = getWorkerCount();

    console.log("🚀 Starting worker cluster:", workers);

    for (let i = 0; i < workers; i++) {
      cluster.fork();
    }

    cluster.on("exit", () => {
      cluster.fork();
    });

  } else {

    console.log("👷 Worker started", process.pid);

    require("./ai.partition.worker");
    require("./followup.worker");

  }

};
