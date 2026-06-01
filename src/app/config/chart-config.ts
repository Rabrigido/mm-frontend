/**
 * Chart Configuration Defaults
 * Centralized ECharts configuration and utilities
 */

export const ECHART_DEFAULTS = {
  TOOLTIP: {
    trigger: 'axis',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderColor: '#64748b',
    textStyle: {
      color: '#f1f5f9',
    },
  },

  GRID: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '8%',
    containLabel: true,
  },

  X_AXIS: {
    type: 'category',
    boundaryGap: true,
    axisLabel: {
      color: '#94a3b8',
      rotate: 45,
    },
    axisLine: {
      lineStyle: {
        color: '#334155',
      },
    },
  },

  Y_AXIS: {
    type: 'value',
    axisLabel: {
      color: '#94a3b8',
    },
    axisLine: {
      lineStyle: {
        color: '#334155',
      },
    },
    splitLine: {
      lineStyle: {
        color: '#475569',
      },
    },
  },

  SERIES: {
    type: 'bar',
    itemStyle: {
      color: '#3b82f6',
    },
    emphasis: {
      itemStyle: {
        color: '#60a5fa',
      },
    },
  },

  COLOR_PALETTE: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'],
};

/**
 * Get default bar chart options
 */
export function getDefaultBarChartOptions(title?: string) {
  return {
    title: title ? { text: title, left: 'center', textStyle: { color: '#f1f5f9' } } : undefined,
    tooltip: ECHART_DEFAULTS.TOOLTIP,
    grid: ECHART_DEFAULTS.GRID,
    xAxis: ECHART_DEFAULTS.X_AXIS,
    yAxis: ECHART_DEFAULTS.Y_AXIS,
    series: ECHART_DEFAULTS.SERIES,
    color: ECHART_DEFAULTS.COLOR_PALETTE,
  };
}
