process.env.NODE_ENV = "test";
import { executiveIdentityTests } from "./executiveIdentity.test";
import { executiveExecutionTests } from "./executiveExecution.test";
import { shutdown } from "../runtime/lifecycle";
import prisma from "../config/prisma";

const run = async () => {
  let failures = 0;
  const tests = [
    ...executiveIdentityTests,
    ...executiveExecutionTests
  ];

  console.log("Cleaning database collections before running tests...");
  await prisma.executiveIdentity.deleteMany({});
  await prisma.executiveDNA.deleteMany({});
  await prisma.executiveMemory.deleteMany({});
  await prisma.goal.deleteMany({});
  await prisma.goalAssumption.deleteMany({});
  await prisma.strategy.deleteMany({});
  await prisma.executivePlan.deleteMany({});
  await prisma.decision.deleteMany({});
  await prisma.execution.deleteMany({});
  await prisma.systemKeyValueStore.deleteMany({});
  console.log("Database cleaned successfully.");

  console.log(`Starting execution of ${tests.length} Executive Persistence & Foundation Tests...`);

  for (const testCase of tests) {
    try {
      console.log(`\nRUNNING: ${testCase.name}`);
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(error);
    }
  }

  await shutdown().catch(() => undefined);
  console.log(`\nExecutive Persistence Foundation Test Execution Summary:`);
  if (failures > 0) {
    console.error(`❌ ${failures} test case(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${tests.length} test cases passed successfully!`);
    process.exit(0);
  }
};

void run();
