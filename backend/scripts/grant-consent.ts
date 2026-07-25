import prisma from "../src/config/prisma";
import { createConsentAuthorityWriterService } from "../src/services/consentAuthorityWriter.service";

async function main() {
  // Get the arguments from the command line or use defaults for the current test lead
  const businessId = process.argv[2] || "6a53cbc44e5ccd9c218a49e3";
  const leadId = process.argv[3] || "6a63755aad10ed3af4d70293";
  const channel = process.argv[4] || "INSTAGRAM";
  const scope = "GENERAL";

  console.log(`\n--- Granting AI Consent (Enterprise Solution) ---`);
  console.log(`Business ID : ${businessId}`);
  console.log(`Lead ID     : ${leadId}`);
  console.log(`Channel     : ${channel}`);
  console.log(`Scope       : ${scope}\n`);

  // Verify lead exists
  const leadExists = await prisma.lead.findUnique({
    where: { id: leadId }
  });

  if (!leadExists) {
    console.error(`Error: Lead with ID ${leadId} not found in the database.`);
    process.exit(1);
  }

  const consentWriter = createConsentAuthorityWriterService();
  
  // Call the official system service to record granted consent
  const result = await consentWriter.grantConsent({
    businessId,
    leadId,
    channel,
    scope,
    source: "CRM_MANUAL_TOGGLE",
    legalBasis: "USER_REQUEST",
    actor: "SYSTEM_ADMIN",
    metadata: {
      note: "Granted manually via administrative tools for verification testing"
    }
  });

  console.log(`Success! Consent registered:`);
  console.log(JSON.stringify(result, null, 2));

  // Reset unresolved count if it's blocking routing (since too many unresolved support queries force human escalation)
  console.log(`\nChecking if lead has too many unresolved messages...`);
  const receptionMemory = await prisma.receptionMemory.findFirst({
    where: { leadId }
  });

  if (receptionMemory && receptionMemory.unresolvedCount > 0) {
    console.log(`Current unresolved messages count: ${receptionMemory.unresolvedCount}`);
    console.log(`Resetting unresolved count to 0 to allow AI response simulation...`);
    
    await prisma.receptionMemory.update({
      where: { id: receptionMemory.id },
      data: {
        unresolvedCount: 0,
        escalationRisk: 0,
        abuseRisk: 0
      }
    });
    console.log(`Unresolved count successfully reset to 0!`);
  }
}

main()
  .catch((error) => {
    console.error("Failed to grant consent:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
