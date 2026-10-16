import type { CurrentActivity } from '../domain/types';
import type { ActivityLayout } from '../infrastructure/preferences';

/** Stable visual ordering only: never changes a canonical activity or its audit. */
export function orderActivities<T extends Pick<CurrentActivity, 'id' | 'sortOrder'>>(activities: readonly T[], layout?: ActivityLayout): T[] {
  const rank = new Map((layout?.order ?? []).map((id, index) => [id, index]));
  const pins = new Set(layout?.pinned ?? []);
  return activities.map((activity, index) => ({ activity, index })).sort((a, b) =>
    Number(pins.has(b.activity.id)) - Number(pins.has(a.activity.id)) ||
    (rank.get(a.activity.id) ?? Infinity) - (rank.get(b.activity.id) ?? Infinity) ||
    a.activity.sortOrder - b.activity.sortOrder || a.index - b.index).map(item => item.activity);
}

/** Reorders the visible group while retaining IDs outside an active filter. */
export function moveActivity(activities: readonly CurrentActivity[], layout: ActivityLayout, id: string, destination: number): ActivityLayout {
  const sorted = orderActivities(activities, layout), source = sorted.findIndex(activity => activity.id === id);
  if (source < 0 || !Number.isFinite(destination)) return layout;
  const pinned = new Set(layout.pinned), group = sorted.map((activity, index) => ({ activity, index })).filter(item => pinned.has(item.activity.id) === pinned.has(id));
  const target = Math.max(group[0].index, Math.min(group[group.length - 1].index, Math.round(destination)));
  const [activity] = sorted.splice(source, 1); sorted.splice(target, 0, activity);
  const visible = new Set(sorted.map(item => item.id));
  return { order: [...sorted.map(item => item.id), ...layout.order.filter(value => !visible.has(value))], pinned: [...layout.pinned] };
}

export function togglePinned(layout: ActivityLayout, id: string): ActivityLayout {
  return { order: [...layout.order], pinned: layout.pinned.includes(id) ? layout.pinned.filter(value => value !== id) : [...layout.pinned, id] };
}
