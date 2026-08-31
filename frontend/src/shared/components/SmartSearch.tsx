import api from "@/shared/api/axios";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useTheme } from "@/shared/hooks/useTheme";
import React, { useEffect, useRef, useState } from "react";
import { FiArrowRight, FiSearch, FiX } from "react-icons/fi";

interface SymbolResult {
  symbol: string;
  description: string;
  type: string;
}

interface SmartSearchProps {
  onSubmit: (symbol: string) => void;
  placeholder?: string;
  className?: string;
  initialValue?: string;
}

export const SmartSearch: React.FC<SmartSearchProps> = ({ 
  onSubmit, 
  placeholder = "Type stock symbol (e.g. AAPL)", 
  className = "",
  initialValue = ""
}) => {
  const { theme } = useTheme();
  const [value, setValue] = useState(initialValue);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchResults = async (query: string) => {
    if (query.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(`/api/v1/search/symbol-lookup?q=${query}`);
      if (res.data.success) {
        setResults(res.data.data);
        setShowDropdown(res.data.data.length > 0);
      }
    } catch (err) {
      console.error("Symbol lookup failed", err);
    } finally {
      setLoading(false);
    }
  };

  const prevValueRef = useRef<string>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (value.trim()) {
        fetchResults(value.trim());
      } else {
        setResults([]);
        setShowDropdown(false);
        // Notify parent of a user-initiated clear only — skip the initial empty mount
        // so we don't fire a spurious onSubmit("") that causes the parent to 404.
        if (prevValueRef.current && value === "") {
          onSubmit("");
        }
      }
      prevValueRef.current = value;
    }, 500);
    return () => clearTimeout(timer);
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onSubmit(value.trim().toUpperCase());
      setShowDropdown(false);
    }
  };

  const handleSelect = (symbol: string) => {
    setValue(symbol);
    onSubmit(symbol);
    setShowDropdown(false);
  };

  const handleClear = () => {
    setValue("");
    onSubmit("");
    setResults([]);
    setShowDropdown(false);
  };

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      <div className={`relative group transition-all duration-300 ${
        theme === 'dark' ? 'bg-[#111111]' : 'bg-white shadow-sm'
      } border rounded-2xl overflow-hidden ${
        showDropdown ? 'border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.1)]' : 'border-white/10 hover:border-white/20'
      }`}>
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
          {loading ? <Skeleton className="w-5 h-5 rounded-full" /> : <FiSearch />}
        </div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => value.trim() && setShowDropdown(true)}
          placeholder={placeholder}
          className={`w-full bg-transparent pl-11 pr-12 py-3.5 text-base font-semibold outline-none transition-colors ${
            theme === 'dark' ? 'text-white placeholder:text-gray-600' : 'text-gray-900 placeholder:text-gray-400'
          }`}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-cyan-500 transition-colors"
          >
            <FiX size={18} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className={`absolute left-0 right-0 mt-2 rounded-[1.5rem] border z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xl ${
          theme === 'dark' ? 'bg-[#0F1219] border-white/10' : 'bg-white border-gray-200'
        }`}>
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
            {results.map((item) => (
              <button
                type="button"
                key={item.symbol}
                onClick={() => handleSelect(item.symbol)}
                className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors border-b last:border-b-0 ${
                  theme === 'dark' 
                    ? 'border-white/5 hover:bg-white/5' 
                    : 'border-gray-100 hover:bg-gray-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`font-black tracking-widest ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{item.symbol}</span>
                    <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-500 text-[8px] font-black rounded uppercase border border-cyan-500/20">{item.type}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 truncate font-semibold uppercase tracking-wider">{item.description}</div>
                </div>
                <FiArrowRight className="text-gray-700 dark:text-gray-700 group-hover:text-cyan-500 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
