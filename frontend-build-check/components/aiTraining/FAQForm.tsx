"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

type FAQFormProps = {
  clientId?: string;
};

export default function FAQForm({ clientId = "" }: FAQFormProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";

  useEffect(() => {
    const loadFAQs = async () => {
      try {
        setFetching(true);
        const response = await apiFetch<FAQ[]>(`/api/training/faq${query}`);

        if (response.success) {
          setFaqs(Array.isArray(response.data) ? response.data : []);
        }
      } catch (err) {
        console.error("Load FAQ error:", err);
      } finally {
        setFetching(false);
      }
    };

    void loadFAQs();
  }, [query]);

  const handleAdd = async () => {
    if (!question.trim() || !answer.trim()) {
      alert("Please fill both fields");
      return;
    }

    try {
      setLoading(true);

      const response = await apiFetch<FAQ>("/api/training/faq", {
        method: "POST",
        body: JSON.stringify({
          question,
          answer,
          clientId: clientId || undefined,
        }),
      });

      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed");
      }

      alert("âœ… FAQ added");
      setFaqs((prev) => [response.data as FAQ, ...prev]);
      setQuestion("");
      setAnswer("");
    } catch (err: any) {
      console.error(err);
      alert("âŒ Failed to add FAQ");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <p className="text-sm text-gray-500">Loading FAQs...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-[24px] border border-slate-200/80 bg-white/82 p-5 shadow-sm">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400"
        />

        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Answer"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400"
          rows={4}
        />

        <button
          onClick={handleAdd}
          disabled={loading}
          className="brand-button-primary w-full"
        >
          {loading ? "Adding..." : "Add FAQ"}
        </button>
      </div>

      <div className="space-y-3">
        {faqs.length === 0 && (
          <p className="brand-empty-state rounded-[22px] px-4 py-6 text-center text-sm">
            No FAQs yet
          </p>
        )}

        {faqs.map((faq) => (
          <div
            key={faq.id}
            className="rounded-[22px] border border-slate-200/80 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-sm font-semibold text-gray-900">{faq.question}</p>
            <p className="mt-1 text-sm text-gray-600">{faq.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
