"use client";

interface Props {
  results: any[];
  loading: boolean;
  activeIndex: number;
  onSelect: (item: any) => void;
}

export default function SearchDropdown({
  results,
  loading,
  activeIndex,
  onSelect,
}: Props) {
  return (
    <div className="w-full bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl shadow-sm overflow-hidden">

      {loading && (
        <div className="p-3 text-sm text-gray-500 animate-pulse">
          Searching...
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="p-3 text-sm text-gray-500">
          No results found
        </div>
      )}

      {results.map((item, index) => (
        <div
          key={item.id}
          onClick={() => onSelect(item)}
          className={`px-4 py-3 text-sm text-gray-800 cursor-pointer transition ${
            index === activeIndex
              ? "bg-blue-50"
              : "hover:bg-blue-50"
          }`}
        >
          {item.title}
        </div>
      ))}

    </div>
  );
}