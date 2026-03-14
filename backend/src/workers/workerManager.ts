import os from "os";

export const getWorkerCount = () => {

  const cpu = os.cpus().length;

  if (cpu <= 2) return 1;

  if (cpu <= 4) return 2;

  return cpu - 1;

};