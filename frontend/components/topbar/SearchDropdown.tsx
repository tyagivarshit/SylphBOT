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
    <div className="w-full bg-white border-t border-gray-200">

      {loading && (
        <div className="p-3 text-sm text-gray-500">
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
          className={`p-3 text-sm text-gray-800 cursor-pointer ${
            index === activeIndex
              ? "bg-gray-100"
              : "hover:bg-gray-100"
          }`}
        >
          {item.title}
        </div>
      ))}

    </div>
  );
}