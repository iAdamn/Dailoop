import type { CurrentActivity } from '../domain';

const searchKey = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

/** Suggestions reuse an existing label instead of creating spelling variants. */
export function categorySuggestions(activities: readonly CurrentActivity[], query: string): string[] {
  const labels = new Map<string, string>();
  for (const activity of activities) {
    if (activity.category) {
      const key = searchKey(activity.category);
      if (!labels.has(key)) labels.set(key, activity.category);
    }
  }
  const key = searchKey(query);
  return [...labels.values()].filter(label => searchKey(label).includes(key)).sort((a, b) => a.localeCompare(b, 'es'));
}

export interface ActivityCategoryGroup { category: string | null; activities: CurrentActivity[] }

/** Exact stored labels keep folder membership compatible with category filters. */
export function groupActivitiesByCategory(activities: readonly CurrentActivity[]): ActivityCategoryGroup[] {
  const groups = new Map<string | null, CurrentActivity[]>();
  for (const activity of activities) {
    const members = groups.get(activity.category);
    if (members) members.push(activity);
    else groups.set(activity.category, [activity]);
  }
  return [...groups.entries()].sort(([a], [b]) => a === null ? 1 : b === null ? -1 : a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .map(([category, members]) => ({ category, activities: members }));
}
