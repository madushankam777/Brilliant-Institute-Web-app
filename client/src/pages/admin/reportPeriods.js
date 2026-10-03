// period choices shared by the Reports and Analytics pages
export const PRESETS = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'thisQuarter', label: 'This quarter' },
  { value: 'lastQuarter', label: 'Last quarter' },
  { value: 'thisYear', label: 'This year' },
  { value: 'lastYear', label: 'Last year' },
  { value: 'last12Months', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom dates' },
];

export function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// from / to dates for a preset
export function presetRange(preset) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const quarter = Math.floor(month / 3);
  if (preset === 'thisMonth') return { from: toKey(new Date(year, month, 1)), to: toKey(today) };
  if (preset === 'lastMonth') return { from: toKey(new Date(year, month - 1, 1)), to: toKey(new Date(year, month, 0)) };
  if (preset === 'last90') return { from: toKey(new Date(year, month, today.getDate() - 89)), to: toKey(today) };
  if (preset === 'thisQuarter') return { from: toKey(new Date(year, quarter * 3, 1)), to: toKey(today) };
  if (preset === 'lastQuarter') {
    return { from: toKey(new Date(year, quarter * 3 - 3, 1)), to: toKey(new Date(year, quarter * 3, 0)) };
  }
  if (preset === 'thisYear') return { from: toKey(new Date(year, 0, 1)), to: toKey(today) };
  if (preset === 'lastYear') return { from: toKey(new Date(year - 1, 0, 1)), to: toKey(new Date(year - 1, 11, 31)) };
  if (preset === 'last12Months') return { from: toKey(new Date(year - 1, month, today.getDate() + 1)), to: toKey(today) };
  return { from: toKey(new Date(year, month, today.getDate() - 29)), to: toKey(today) };
}
