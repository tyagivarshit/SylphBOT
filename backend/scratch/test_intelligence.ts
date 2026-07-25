import { getIntelligenceRuntimeInfluence } from "../src/services/intelligence/intelligenceRuntimeInfluence.service";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  const businessId = "6a53cbc44e5ccd9c218a49e3";
  const leadId = "6a63755aad10ed3af4d70293";

  console.log("Calling getIntelligenceRuntimeInfluence...");
  try {
    const res = await getIntelligenceRuntimeInfluence({
      businessId,
      leadId,
    });
    console.log("Result controls:", JSON.stringify(res.controls, null, 2));
    console.log("Stale status:", res.stale);
  } catch (err) {
    console.error("Error occurred:", err);
  }
}

main().catch(console.error);
