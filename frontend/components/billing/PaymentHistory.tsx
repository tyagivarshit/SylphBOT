"use client";

import { ExternalLink, Download } from "lucide-react";

type Invoice = {
  id: string;
  amount?: number;
  subtotal?: number;
  taxAmount?: number;
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
    switch (status?.toLowerCase()) {
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

  const sorted = [...invoices].sort(
    (a, b) => (b.created || 0) - (a.created || 0)
  );

  const formatAmount = (amount?: number, currency?: string) => {
    if (amount === undefined || amount === null) return "-";

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency?.toUpperCase() || "USD",
    }).format(amount / 100);
  };

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 md:p-6 shadow-sm space-y-6">

      {/* HEADER */}
      <div>
        <h3 className="text-base font-semibold text-gray-800">
          Payment History
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          View all your past invoices and payments
        </p>
      </div>

      {/* EMPTY */}
      {sorted.length === 0 && (
        <div className="text-center py-10 text-gray-500 text-sm border border-dashed border-blue-200 rounded-xl">
          No payments yet
        </div>
      )}

      {/* LIST */}
      <div className="space-y-3">
        {sorted.map((inv) => {
          const date = inv.created
            ? new Date(inv.created * 1000).toLocaleDateString()
            : "-";

          return (
            <div
              key={inv.id}
              className="rounded-xl border border-blue-100 bg-white/80 backdrop-blur p-4 transition-all hover:shadow-md"
            >

              {/* MOBILE */}
              <div className="flex flex-col gap-3 md:hidden">

                <div className="flex justify-between items-center">
                  <p className="text-base font-semibold text-gray-900">
                    {formatAmount(inv.amount, inv.currency)}
                  </p>

                  <span
                    className={`text-[10px] px-2 py-1 rounded-full font-medium ${getStatusColor(
                      inv.status
                    )}`}
                  >
                    {inv.status?.toUpperCase() || "UNKNOWN"}
                  </span>
                </div>

                {(inv.subtotal !== undefined || inv.taxAmount !== undefined) && (
                  <div className="text-xs text-gray-500 space-y-1">
                    {inv.subtotal !== undefined && (
                      <p>
                        Subtotal: {formatAmount(inv.subtotal, inv.currency)}
                      </p>
                    )}
                    {inv.taxAmount !== undefined && (
                      <p>
                        Tax: {formatAmount(inv.taxAmount, inv.currency)}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-500">{date}</p>

                <div className="flex gap-3">
                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 text-xs py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
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
                      className="flex-1 flex items-center justify-center gap-1 text-xs py-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition"
                    >
                      <Download size={14} />
                      PDF
                    </a>
                  )}
                </div>
              </div>

              {/* DESKTOP */}
              <div className="hidden md:flex items-center justify-between">

                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatAmount(inv.amount, inv.currency)}
                  </p>

                  {(inv.subtotal !== undefined || inv.taxAmount !== undefined) && (
                    <div className="text-xs text-gray-500 space-y-0.5">
                      {inv.subtotal !== undefined && (
                        <p>
                          Subtotal: {formatAmount(inv.subtotal, inv.currency)}
                        </p>
                      )}
                      {inv.taxAmount !== undefined && (
                        <p>
                          Tax: {formatAmount(inv.taxAmount, inv.currency)}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-500">{date}</p>
                </div>

                <div className="flex items-center gap-4">

                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusColor(
                      inv.status
                    )}`}
                  >
                    {inv.status?.toUpperCase() || "UNKNOWN"}
                  </span>

                  <div className="flex items-center gap-3">
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

            </div>
          );
        })}
      </div>
    </div>
  );
}