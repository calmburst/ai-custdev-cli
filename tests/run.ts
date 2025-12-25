import { tests as allocationTests } from "./allocations.test";
import { tests as analysisPromptTests } from "./analysis-prompt.test";
import { tests as configLoaderTests } from "./config-loader.test";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const runTests = async (cases: TestCase[]): Promise<number> => {
  let failures = 0;
  for (const testCase of cases) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${testCase.name}`);
      console.error(message);
    }
  }
  return failures;
};

const main = async (): Promise<void> => {
  const allTests: TestCase[] = [
    ...configLoaderTests,
    ...allocationTests,
    ...analysisPromptTests,
  ];
  const failures = await runTests(allTests);
  if (failures > 0) {
    process.exitCode = 1;
    console.error(`Failed ${failures} of ${allTests.length} tests.`);
    return;
  }
  console.log(`All ${allTests.length} tests passed.`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Test runner failed: ${message}`);
  process.exitCode = 1;
});
