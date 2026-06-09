import prisma from "../config/prisma";
import { getAllLeads, getAllLeadAppointments } from "../analytics/analyticsDashboard.repository";
import { getAnalyticsDashboard } from "../services/analyticsDashboard.service";

async function runBenchmark() {
  console.log("Starting benchmark...");

  // 1. Find a business with leads
  const leadSample = await prisma.lead.findFirst({
    where: { deletedAt: null }
  });

  if (!leadSample) {
    console.error("No leads found in database. Cannot run benchmark.");
    process.exit(1);
  }

  const businessId = leadSample.businessId;
  console.log(`Using Business ID: ${businessId}`);

  const totalLeads = await prisma.lead.count({ where: { businessId, deletedAt: null } });
  const totalAppointments = await prisma.appointment.count({ where: { businessId } });
  console.log(`Total Leads: ${totalLeads}`);
  console.log(`Total Appointments: ${totalAppointments}`);

  // Test range
  const range = "30d";
  const planKey = "ELITE"; // Force compute (ELITE triggers the projection)

  // 2. Measure getAllLeadAppointments
  console.log("Measuring getAllLeadAppointments...");
  const t0 = performance.now();
  const leadAppts = await getAllLeadAppointments(businessId);
  const t1 = performance.now();
  const durationGetAllLeadAppointments = t1 - t0;
  console.log(`getAllLeadAppointments: ${durationGetAllLeadAppointments.toFixed(2)}ms (returned ${leadAppts.length} rows)`);

  // 3. Measure getAllLeads
  console.log("Measuring getAllLeads...");
  const t2 = performance.now();
  const leads = await getAllLeads(businessId);
  const t3 = performance.now();
  const durationGetAllLeads = t3 - t2;
  console.log(`getAllLeads: ${durationGetAllLeads.toFixed(2)}ms (returned ${leads.length} rows)`);

  // 4. Measure computeAnalyticsDashboardProjection
  // Wait, computeAnalyticsDashboardProjection is not exported from service.ts, but we can export it or measure getAnalyticsDashboard.
  // Actually, getAnalyticsDashboard is exported. Let's measure getAnalyticsDashboard.
  // Wait, let's import getAnalyticsDashboard.
  console.log("Measuring getAnalyticsDashboard...");
  
  const t4 = performance.now();
  const result = await getAnalyticsDashboard(businessId, range, planKey);
  const t5 = performance.now();
  const durationGetAnalyticsDashboard = t5 - t4;
  console.log(`getAnalyticsDashboard: ${durationGetAnalyticsDashboard.toFixed(2)}ms`);

  console.log("\nBenchmark complete.");
  console.log("---------------------------------------");
  console.log(`getAllLeadAppointments: ${(durationGetAllLeadAppointments / 1000).toFixed(3)}s`);
  console.log(`getAllLeads: ${(durationGetAllLeads / 1000).toFixed(3)}s`);
  console.log(`getAnalyticsDashboard: ${(durationGetAnalyticsDashboard / 1000).toFixed(3)}s`);
  console.log("---------------------------------------");

  process.exit(0);
}

runBenchmark().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
