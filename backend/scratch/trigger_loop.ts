import { runIntelligenceLoop } from "../src/services/intelligence/intelligenceOS.service";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  const businessId = "6a53cbc44e5ccd9c218a49e3";
  console.log(`Triggering intelligence loop for business: ${businessId}...`);
  const result = await runIntelligenceLoop({
    businessId,
  });
  console.log("Intelligence Loop Result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
