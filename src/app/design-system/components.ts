/**
 * Component Patterns Design System
 * Pre-composed Tailwind classes for common UI components
 */

export const components = {
  // Button Variants
  button: {
    primary: 'px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition',
    primarySmall: 'px-3 py-1.5 rounded-xl text-sm bg-blue-600 text-white hover:bg-blue-700 transition',
    secondary: 'px-3 py-1.5 rounded-xl text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 transition',
    success: 'px-3 py-1.5 rounded-xl text-sm bg-emerald-600 text-white border-emerald-600 transition',
    danger: 'px-3 py-1.5 rounded-lg bg-red-600 text-white',
    dangerSmall: 'px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold',
    icon: 'px-3 py-2 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-md text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5',
    neutral: 'px-3 py-1.5 rounded-xl text-sm border transition hover:bg-gray-50',
    neutralDark: 'px-3 py-1.5 rounded-xl text-sm bg-gray-900 text-white border-gray-900',
  },

  // Card Variants
  card: {
    default: 'bg-white rounded-2xl border p-4',
    padding: 'p-4',
    paddingSmall: 'p-3',
  },

  // Container/Layout
  container: {
    maxWidth: 'max-w-5xl mx-auto p-6',
  },

  // Grid Layouts
  grid: {
    responsive: 'grid md:grid-cols-2 gap-4',
    twoCol: 'md:grid-cols-2',
  },

  // Flex Utilities
  flex: {
    center: 'flex items-center justify-center',
    between: 'flex items-center justify-between',
    start: 'flex items-start justify-between',
    wrap: 'flex flex-wrap',
  },

  // Legend/Indicator
  legend: {
    container: 'absolute top-4 left-4 bg-white/90 backdrop-blur p-4 rounded-lg shadow-md text-sm border border-slate-100 max-w-xs z-10',
    row: 'flex items-center gap-2',
    indicator: 'w-3 h-3 rounded-full',
    text: 'text-slate-600',
    divider: 'mt-4 pt-3 border-t border-slate-100',
  },

  // Input Field
  input: {
    default: 'flex-1 border rounded-xl px-3 py-2',
  },

  // Link
  link: {
    primary: 'text-blue-600 hover:underline text-sm',
  },

  // Loading State
  loading: {
    overlay: 'absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-50',
    spinner: 'w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2',
    text: 'text-indigo-600 font-medium',
  },

  // Error State
  error: {
    overlay: 'absolute inset-0 flex items-center justify-center bg-red-50/90 z-50 text-red-600',
  },

  // Download Button
  downloadButton: 'px-3 py-2 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-md text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5',
};
