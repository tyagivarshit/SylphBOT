process.env.NODE_ENV = "test";
import { executiveGoldenPathTests } from "./executiveGoldenPath.test";

const run = async () => {
  let failures = 0;
  console.log("Running golden path validation tests...");
  for (const testCase of executiveGoldenPathTests) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error: any) {
      failures += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(error);
    }
  }
  process.exit(failures > 0 ? 1 : 0);
};

void run();
