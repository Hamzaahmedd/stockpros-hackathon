import api from '@/shared/api/axios'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { useTheme } from '@/shared/hooks/useTheme'
import React, { useEffect, useId, useRef, useState } from 'react'
import { FiArrowRight, FiSearch, FiX } from 'react-icons/fi'

interface SymbolResult {
  symbol: string
  description: string
  type: string
}

interface SmartSearchProps {
  onSubmit: (symbol: string) => void
  placeholder?: string
  className?: string
  initialValue?: string
  inputId?: string
}

export const SmartSearch: React.FC<SmartSearchProps> = ({
  onSubmit,
  placeholder = 'Type stock symbol (e.g. AAPL)',
  className = '',
  initialValue = '',
  inputId,
}) => {
  const { theme } = useTheme()
  const [value, setValue] = useState(initialValue)
  const [results, setResults] = useState<SymbolResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const instanceId = useId()
  const listboxId = `smart-search-listbox-${instanceId}`
  const getOptionId = (index: number) =>
    `smart-search-option-${instanceId}-${index}`

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchResults = async (query: string) => {
    if (query.length < 1) {
      setResults([])
      setShowDropdown(false)
      return
    }

    setLoading(true)
    try {
      const res = await api.get(`/api/v1/search/symbol-lookup?q=${query}`)
      if (res.data.success) {
        setResults(res.data.data)
        setShowDropdown(res.data.data.length > 0)
        setActiveIndex(-1)
      }
    } catch (err) {
      console.error('Symbol lookup failed', err)
    } finally {
      setLoading(false)
    }
  }

  const prevValueRef = useRef<string>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (value.trim()) {
        fetchResults(value.trim())
      } else {
        setResults([])
        setShowDropdown(false)
        // Notify parent of a user-initiated clear only — skip the initial empty mount
        // so we don't fire a spurious onSubmit("") that causes the parent to 404.
        if (prevValueRef.current && value === '') {
          onSubmit('')
        }
      }
      prevValueRef.current = value
    }, 500)
    return () => clearTimeout(timer)
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (showDropdown && results.length > 0) {
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % results.length)
      }
      return
    }

    if (e.key === 'ArrowUp') {
      if (showDropdown && results.length > 0) {
        e.preventDefault()
        setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1))
      }
      return
    }

    if (e.key === 'Enter') {
      if (showDropdown && activeIndex >= 0 && results[activeIndex]) {
        handleSelect(results[activeIndex].symbol)
      } else {
        onSubmit(value.trim().toUpperCase())
        setShowDropdown(false)
      }
      return
    }

    if (e.key === 'Escape' && showDropdown) {
      setShowDropdown(false)
      setActiveIndex(-1)
    }
  }

  const handleSelect = (symbol: string) => {
    setValue(symbol)
    onSubmit(symbol)
    setShowDropdown(false)
    setActiveIndex(-1)
  }

  const handleClear = () => {
    setValue('')
    onSubmit('')
    setResults([])
    setShowDropdown(false)
  }

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      <div
        className={`group relative transition-all duration-300 ${
          theme === 'dark' ? 'bg-[#111111]' : 'bg-white shadow-sm'
        } overflow-hidden rounded-2xl border ${
          showDropdown
            ? 'border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
            : 'border-white/10 hover:border-white/20'
        }`}
      >
        <div className='absolute left-4 top-1/2 -translate-y-1/2 text-gray-500'>
          {loading ? (
            <Skeleton className='h-5 w-5 rounded-full' />
          ) : (
            <FiSearch />
          )}
        </div>
        <input
          id={inputId}
          role='combobox'
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete='list'
          aria-activedescendant={
            activeIndex >= 0 ? getOptionId(activeIndex) : undefined
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => value.trim() && setShowDropdown(true)}
          placeholder={placeholder}
          className={`w-full bg-transparent py-3.5 pl-11 pr-12 text-base font-semibold outline-none transition-colors ${
            theme === 'dark'
              ? 'text-white placeholder:text-gray-600'
              : 'text-gray-900 placeholder:text-gray-400'
          }`}
        />
        {value && (
          <button
            type='button'
            onClick={handleClear}
            className='absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-cyan-500'
          >
            <FiX size={18} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          className={`absolute left-0 right-0 z-[100] mt-2 overflow-hidden rounded-[1.5rem] border shadow-2xl duration-200 animate-in fade-in slide-in-from-top-2 ${
            theme === 'dark'
              ? 'border-white/10 bg-[#0F1219]'
              : 'border-gray-200 bg-white'
          }`}
        >
          <div
            id={listboxId}
            role='listbox'
            className='custom-scrollbar max-h-[300px] overflow-y-auto'
          >
            {results.map((item, index) => (
              <button
                type='button'
                id={getOptionId(index)}
                role='option'
                aria-selected={index === activeIndex}
                key={item.symbol}
                onClick={() => handleSelect(item.symbol)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center justify-between border-b px-5 py-4 text-left transition-colors last:border-b-0 ${
                  theme === 'dark' ? 'border-white/5' : 'border-gray-100'
                } ${
                  index === activeIndex
                    ? theme === 'dark'
                      ? 'bg-white/10'
                      : 'bg-gray-100'
                    : theme === 'dark'
                      ? 'hover:bg-white/5'
                      : 'hover:bg-gray-50'
                }`}
              >
                <div className='min-w-0 flex-1'>
                  <div className='mb-0.5 flex items-center gap-2'>
                    <span
                      className={`font-black tracking-widest ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}
                    >
                      {item.symbol}
                    </span>
                    <span className='rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-cyan-500'>
                      {item.type}
                    </span>
                  </div>
                  <div className='truncate text-[10px] font-semibold uppercase tracking-wider text-gray-500'>
                    {item.description}
                  </div>
                </div>
                <FiArrowRight className='text-gray-700 transition-colors group-hover:text-cyan-500 dark:text-gray-700' />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
