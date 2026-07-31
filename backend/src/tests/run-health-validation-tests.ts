process.env.NODE_ENV = "test";
import { executiveHealthValidationTests } from "./executiveHealthValidation.test";

const run = async () => {
  let failures = 0;
  console.log("Running health validation tests...");
  for (const testCase of executiveHealthValidationTests) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error: any) {
      failures += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(error);
      if (error.actual !== undefined) {
        console.error("Actual:", error.actual);
        console.error("Expected:", error.expected);
      }
    }
  }
  process.exit(failures > 0 ? 1 : 0);
};

void run();
