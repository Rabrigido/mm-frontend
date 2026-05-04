/**
 * Color Design System
 * Semantic color tokens mapped to Tailwind classes
 */

export const colors = {
  // Primary Actions
  primary: {
    bg: 'bg-blue-600',
    bgHover: 'hover:bg-blue-700',
    text: 'text-blue-600',
    border: 'border-blue-600',
  },

  // Success/Positive Actions
  success: {
    bg: 'bg-emerald-600',
    bgHover: 'hover:bg-emerald-700',
    text: 'text-emerald-600',
    border: 'border-emerald-600',
  },

  // Danger/Destructive Actions
  danger: {
    bg: 'bg-red-600',
    bgHover: 'hover:bg-red-700',
    text: 'text-red-600',
    border: 'border-red-600',
  },

  // Neutral/Secondary Actions
  neutral: {
    bg: 'bg-white',
    bgHover: 'hover:bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-300',
    dark: 'bg-gray-900',
    darkHover: 'hover:bg-gray-800',
  },

  // Background Colors
  background: {
    primary: 'bg-white',
    secondary: 'bg-slate-50',
    light: 'bg-gray-50',
  },

  // Text Colors
  text: {
    primary: 'text-slate-800',
    secondary: 'text-slate-600',
    muted: 'text-slate-500',
    light: 'text-gray-500',
  },

  // Border Colors
  border: {
    primary: 'border-slate-200',
    light: 'border-slate-100',
    muted: 'border-gray-300',
  },

  // Visualization/Graph Colors
  visualization: {
    folder: 'bg-amber-500',
    file: 'bg-slate-500',
    class: 'bg-pink-500',
    function: 'bg-emerald-500',
  },

  // Overlay/Alert Colors
  overlay: {
    error: 'bg-red-50',
    errorText: 'text-red-600',
    loading: 'bg-white/80',
  },

  // Interactive States
  interactive: {
    accent: 'accent-indigo-500',
  },
};
