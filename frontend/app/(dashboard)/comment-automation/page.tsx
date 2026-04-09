"use client";

import CommentAutomationList from "@/components/commentAutomation/CommentAutomationList";

export default function CommentAutomationPage() {
  return (
    <div className="space-y-5">
      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Engagement routing
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Convert public comments into structured private follow-ups without
          cluttering the customer journey.
        </p>
      </div>

      <section className="brand-section-shell rounded-[30px] p-4 sm:p-5 lg:p-6">
        <CommentAutomationList />
      </section>
    </div>
  );
}
