import React from 'react'

export class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='flex h-full items-center justify-center text-sm text-muted-foreground'>
          Heatmap unavailable
        </div>
      )
    }
    return this.props.children
  }
}
