process.env.NODE_ENV = "test";
import { revenueBrainPhase3BTests } from "./revenueBrain.phase3b.test";
import { shutdown } from "../runtime/lifecycle";

const run = async () => {
  let failures = 0;
  for (const testCase of revenueBrainPhase3BTests) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(error);
    }
  }
  await shutdown().catch(() => undefined);
  process.exit(failures > 0 ? 1 : 0);
};

void run();
