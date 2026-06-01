/**
 * Graph/Visualization Design System
 * Styles specific to D3 graphs and data visualizations
 */

export const graphs = {
  // Graph Container
  container: {
    main: 'w-full h-[800px] bg-slate-50 border border-slate-200 rounded-xl relative overflow-hidden',
    inner: 'w-full h-full absolute inset-0',
  },

  // Legend
  legend: {
    container: 'absolute top-4 left-4 bg-white/90 backdrop-blur p-4 rounded-lg shadow-md text-sm border border-slate-100 max-w-xs z-10',
    title: 'font-bold text-slate-800 mb-2',
    itemsContainer: 'space-y-2',
    item: 'flex items-center gap-2',
    label: 'text-slate-600',
    divider: 'mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1',
    controlGroup: 'mt-4 pt-3 border-t border-slate-100',
  },

  // Legend Items (Node Types)
  node: {
    folder: 'w-3 h-3 rounded-full bg-amber-500',
    file: 'w-3 h-3 rounded-full bg-slate-500',
    class: 'w-3 h-3 rounded-full bg-pink-500',
    function: 'w-3 h-3 rounded-full bg-emerald-500',
  },

  // Control Slider
  slider: {
    label: 'flex items-center justify-between mb-1.5',
    labelText: 'text-xs font-medium text-slate-600',
    labelValue: 'text-xs font-mono text-slate-400',
    input: 'w-full h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-500 bg-slate-200',
    range: 'flex justify-between text-[10px] text-slate-400 mt-1',
  },

  // Button Group
  buttonGroup: {
    container: 'mt-4 pt-3 border-t border-slate-100 flex gap-2',
    button: 'flex-1 px-3 py-2 text-xs font-semibold rounded transition-colors',
    expand: 'bg-indigo-600 text-white hover:bg-indigo-700',
    collapse: 'bg-slate-400 text-white hover:bg-slate-500',
  },

  // Download Actions
  actions: {
    container: 'absolute top-4 right-4 flex flex-col gap-2 z-10',
    button: 'px-3 py-2 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-md text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5',
  },

  // State Overlays
  state: {
    loading: {
      overlay: 'absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-50',
      spinner: 'w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2',
      text: 'text-emerald-600 font-medium',
    },
    error: {
      overlay: 'absolute inset-0 flex items-center justify-center bg-red-50/90 z-50 text-red-600',
    },
  },
};
