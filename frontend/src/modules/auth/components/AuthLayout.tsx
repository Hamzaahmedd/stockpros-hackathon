// src/components/AuthLayout.tsx
import React from 'react'

interface AuthLayoutProps {
  children: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  loading?: boolean
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
  loading,
}) => {
  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-[#0a0a0a]'>
        <div className='flex flex-col items-center gap-4'>
          <div className='h-12 w-12 animate-pulse rounded-full bg-primary/10' />
          <div className='h-4 w-40 animate-pulse rounded-md bg-primary/10' />
        </div>
      </div>
    )
  }

  return (
    <div className='flex min-h-screen flex-col bg-black text-white selection:bg-cyan-500/30 md:flex-row'>
      {/* Left Panel: Hero & Branding */}
      <div className='relative hidden flex-col justify-center overflow-hidden bg-gray-900 md:flex md:w-1/2'>
        <img
          src='/stock_bg.png'
          alt='Market Background'
          className='absolute inset-0 h-full w-full object-cover opacity-60 mix-blend-luminosity'
        />
        <div className='absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black'></div>

        {/* Decorative Blur Backgrounds */}
        <div className='absolute left-20 top-20 h-32 w-32 rounded-full bg-cyan-600/20 blur-3xl'></div>
        <div className='absolute bottom-40 right-20 h-48 w-48 rounded-full bg-blue-600/10 blur-3xl'></div>

        <div className='relative z-10 mx-auto flex w-full max-w-2xl flex-col justify-center px-10 lg:px-16'>
          {/* Main Group: Icon on Left, Title & Aligned Description on Right */}
          <div className='flex items-start gap-4 lg:gap-5'>
            <img
              src='/stockpros-logo.png'
              alt='StockPros Logo'
              className='mt-1 h-16 w-16 shrink-0 object-contain lg:h-28 lg:w-28'
            />
            <div className='flex flex-col'>
              <h1 className='text-5xl font-extrabold leading-none tracking-tight text-white lg:text-7xl'>
                Stock<span className='text-cyan-500'>Pros</span>
              </h1>
              <p className='mt-4 text-base font-normal leading-relaxed text-[#9CA3AF] lg:text-lg'>
                Professional-grade market intelligence, predictive forecasting,
                and real-time decision support—all in one unified platform
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Auth Form */}
      <div className='relative flex flex-1 flex-col justify-between overflow-hidden bg-[#0a0a0a] px-6 py-12 lg:px-24'>
        {/* Floating circles */}
        <div className='absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-900/20 blur-[100px]'></div>
        <div className='absolute -left-24 top-1/2 h-64 w-64 rounded-full bg-cyan-900/10 blur-[100px]'></div>

        <div className='relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center'>
          {/* Logo for mobile screens */}
          <div className='mb-12 flex flex-col items-center gap-4 text-center md:hidden'>
            <img
              src='/stockpros-logo.png'
              alt='Logo'
              className='h-20 w-20 object-contain'
            />
            <h2 className='text-4xl font-black text-white'>
              Stock<span className='text-cyan-500'>Pros</span>
            </h2>
          </div>

          <div className='mb-8'>
            <h2 className='mb-3 text-left text-3xl font-bold tracking-tight text-white lg:text-4xl'>
              {title}
            </h2>
            {subtitle && (
              <p className='text-left text-sm font-normal leading-relaxed text-[#9CA3AF] lg:text-base'>
                {subtitle}
              </p>
            )}
          </div>

          {children}
        </div>

        {/* Footer */}
        <footer className='relative z-10 mx-auto mt-6 w-full max-w-md space-y-1 border-t border-white/10 pt-6 text-[11px] font-medium text-gray-400'>
          <div className='flex items-center justify-between gap-3'>
            <span>
              &copy; {new Date().getFullYear()} StockPros. All rights reserved.
            </span>
          </div>
          <p className='leading-relaxed'>
            StockPros outputs are informational and educational only. They are
            not personalized financial, legal, tax, or fiduciary advice.
          </p>
        </footer>
      </div>
    </div>
  )
}
