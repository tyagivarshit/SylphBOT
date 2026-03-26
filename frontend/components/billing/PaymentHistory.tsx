"use client";

import { ExternalLink, Download } from "lucide-react";

type Invoice = {
  id: string;
  amount_paid?: number;
  currency?: string;
  created?: number;
  status?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
};

export default function PaymentHistory({
  invoices = [],
}: {
  invoices: Invoice[];
}) {
  const getStatusColor = (status?: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-700";
      case "open":
        return "bg-yellow-100 text-yellow-700";
      case "void":
        return "bg-gray-200 text-gray-700";
      case "uncollectible":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  /* 🔥 SORT LATEST FIRST */
  const sorted = [...invoices].sort(
    (a, b) => (b.created || 0) - (a.created || 0)
  );

  /* 🔥 FORMATTER */
  const formatAmount = (amount?: number, currency?: string) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency?.toUpperCase() || "USD",
    }).format(amount / 100);
  };

  return (
    <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-sm space-y-6">

      {/* HEADER */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Payment History
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          View all your past invoices and payments
        </p>
      </div>

      {/* LIST */}
      <div className="space-y-3">

        {/* EMPTY */}
        {sorted.length === 0 && (
          <div className="text-center py-10 text-gray-500 text-sm border border-dashed rounded-xl">
            No payments yet
          </div>
        )}

        {sorted.map((inv) => {
          const date = inv.created
            ? new Date(inv.created * 1000).toLocaleDateString()
            : "-";

          return (
            <div
              key={inv.id}
              className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:shadow-md hover:bg-gray-50 transition"
            >
              {/* LEFT */}
              <div className="space-y-1">
                <p className="text-sm font-semibold text-gray-900">
                  {formatAmount(inv.amount_paid, inv.currency)}
                </p>

                <p className="text-xs text-gray-500">
                  {date}
                </p>
              </div>

              {/* RIGHT */}
              <div className="flex items-center gap-4">

                {/* STATUS */}
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusColor(
                    inv.status
                  )}`}
                >
                  {inv.status?.toUpperCase() || "UNKNOWN"}
                </span>

                {/* ACTIONS */}
                <div className="flex items-center gap-2">

                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <ExternalLink size={14} />
                      View
                    </a>
                  )}

                  {inv.invoice_pdf && (
                    <a
                      href={inv.invoice_pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium"
                    >
                      <Download size={14} />
                      PDF
                    </a>
                  )}

                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}