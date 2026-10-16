import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'node_modules/expo-notifications');
const { version } = JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8'));
if (version !== '57.0.23') throw new Error('Review zoned weekly notifications before changing expo-notifications.');
const changes = new Map();
async function patch(relative, before, after) {
  const file = path.join(base, relative);
  const source = changes.get(file) ?? (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  if (source.includes(after)) return;
  if (source.split(before).length !== 2) throw new Error(`Expo notification anchor changed: ${relative}`);
  changes.set(file, source.replace(before, after));
}
const fields = '  dailoopZone?: string;\n  dailoopLeadMinutes?: number;\n  dailoopStartAtMs?: number;\n  dailoopSkipDates?: string[];\n';
for (const relative of ['src/Notifications.types.ts', 'build/Notifications.types.d.ts']) {
  const start = relative.startsWith('build') ? 'export type WeeklyTriggerInput = {\n' : 'export type WeeklyTriggerInput = {\n';
  await patch(relative, start, start + fields);
}
for (const relative of ['src/NotificationScheduler.types.ts', 'build/NotificationScheduler.types.d.ts']) {
  const start = 'export interface NativeWeeklyTriggerInput {\n';
  await patch(relative, start, start + fields);
}
for (const relative of ['src/scheduleNotificationAsync.ts', 'build/scheduleNotificationAsync.js']) {
  const file = path.join(base, relative);
  const source = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  const start = source.indexOf('function parseWeeklyTrigger(');
  const end = source.indexOf('function parseMonthlyTrigger(', start);
  if (start < 0 || end < 0) throw new Error(`Weekly parser missing: ${relative}`);
  const block = source.slice(start, end);
  const indent = relative.startsWith('build') ? '        ' : '    ';
  const before = `${indent}return result;`;
  const after = `${indent}// Dailoop: preserve only the validated, namespaced recurrence extension.\n${indent}if (trigger.dailoopZone !== undefined) {\n${indent}  result.dailoopZone = trigger.dailoopZone;\n${indent}  result.dailoopLeadMinutes = trigger.dailoopLeadMinutes;\n${indent}  result.dailoopStartAtMs = trigger.dailoopStartAtMs;\n${indent}  result.dailoopSkipDates = trigger.dailoopSkipDates;\n${indent}}\n${before}`;
  if (!block.includes(after)) {
    if (block.split(before).length !== 2) throw new Error(`Weekly return changed: ${relative}`);
    changes.set(file, source.slice(0, start) + block.replace(before, after) + source.slice(end));
  }
}
const nativeDir = 'android/src/main/java/expo/modules/notifications/notifications/';
const importBefore = 'import expo.modules.notifications.notifications.triggers.WeeklyTrigger\n';
await patch(nativeDir + 'scheduling/NotificationScheduler.kt', importBefore,
  importBefore + 'import expo.modules.notifications.notifications.triggers.DailoopZonedWeeklyTrigger\n');
const constructor = '        WeeklyTrigger(\n          channelId,\n          weekday.toInt(),\n          hour.toInt(),\n          minute.toInt()\n        )';
await patch(nativeDir + 'scheduling/NotificationScheduler.kt', constructor,
`        val dailoopZone = params.getString("dailoopZone", null)
        if (dailoopZone != null) {
          val lead = params["dailoopLeadMinutes"] as? Number
            ?: throw InvalidArgumentException("Missing Dailoop lead minutes")
          val start = params["dailoopStartAtMs"] as? Number
            ?: throw InvalidArgumentException("Missing Dailoop start date")
          val skip = params["dailoopSkipDates"] as? List<*>
            ?: throw InvalidArgumentException("Missing Dailoop completed dates")
          if (skip.any { it !is String } || lead.toDouble() != lead.toInt().toDouble()
            || start.toDouble() != start.toLong().toDouble()) {
            throw InvalidArgumentException("Invalid Dailoop recurrence values")
          }
          DailoopZonedWeeklyTrigger(channelId, weekday.toInt(), hour.toInt(), minute.toInt(),
            dailoopZone, lead.toInt(), start.toLong(), ArrayList(skip.map { it as String }))
        } else {
${constructor}
        }`);
const kotlin = `package expo.modules.notifications.notifications.triggers

import androidx.core.os.bundleOf
import expo.modules.notifications.notifications.interfaces.SchedulableNotificationTrigger
import kotlinx.parcelize.Parcelize
import java.util.Date

// Separate serializable class preserves Expo's existing WeeklyTrigger wire identity.
@Parcelize
class DailoopZonedWeeklyTrigger(
  override val channelId: String?, val weekday: Int, val hour: Int, val minute: Int,
  val dailoopZone: String, val dailoopLeadMinutes: Int, val dailoopStartAtMs: Long,
  val dailoopSkipDates: ArrayList<String>
) : ChannelAwareTrigger(channelId), SchedulableNotificationTrigger {
  override fun toBundle() = bundleOf("type" to "weekly", "channelId" to channelId,
    "weekday" to weekday, "hour" to hour, "minute" to minute,
    "dailoopZone" to dailoopZone, "dailoopLeadMinutes" to dailoopLeadMinutes,
    "dailoopStartAtMs" to dailoopStartAtMs, "dailoopSkipDates" to dailoopSkipDates)
  override fun nextTriggerDate(): Date = Date(DailoopZonedWeekly.nextFireAt(
    System.currentTimeMillis(), dailoopStartAtMs, dailoopZone, weekday, hour, minute,
    dailoopLeadMinutes, dailoopSkipDates))
  private companion object { private const val serialVersionUID: Long = 1L }
}
`;
const java = await readFile(path.join(root, 'scripts/native/DailoopZonedWeekly.java'), 'utf8');
changes.set(path.join(base, nativeDir, 'triggers/DailoopZonedWeeklyTrigger.kt'), kotlin);
changes.set(path.join(base, nativeDir, 'triggers/DailoopZonedWeekly.java'), java);
// Validate every upstream anchor before mutating anything; rerunning is deterministic.
for (const [file, source] of changes) await writeFile(file, source, 'utf8');
console.log(`Zoned recurrence patch: expo-notifications ${version}; helper SHA256 ${createHash('sha256').update(java).digest('hex')}`);
