package expo.modules.notifications.notifications.triggers;

import java.util.Arrays;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;
import java.util.Locale;

/** Pure calculator shared by the Android trigger and standalone JVM regression tests. */
public final class DailoopZonedWeekly {
  private static final TimeZone UTC = TimeZone.getTimeZone("UTC");
  private static final Set<String> ZONES = new HashSet<>(Arrays.asList(TimeZone.getAvailableIDs()));
  private DailoopZonedWeekly() {}

  private static GregorianCalendar calendar(TimeZone zone, long ms) {
    GregorianCalendar value = new GregorianCalendar(zone, Locale.ROOT);
    value.setLenient(false);
    value.setTimeInMillis(ms);
    return value;
  }

  /** A UTC calendar is only an arithmetic container for local date/time fields. */
  private static GregorianCalendar wallDate(Calendar local, int hour, int minute) {
    GregorianCalendar result = new GregorianCalendar(UTC, Locale.ROOT);
    result.setLenient(false);
    result.clear();
    result.set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH), hour, minute, 0);
    return result;
  }

  private static String dateKey(Calendar day) {
    return String.format(Locale.ROOT, "%04d-%02d-%02d", day.get(Calendar.YEAR), day.get(Calendar.MONTH) + 1, day.get(Calendar.DAY_OF_MONTH));
  }

  private static void validateDate(String date) {
    if (date == null || !date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException("Invalid skip date");
    GregorianCalendar parsed = new GregorianCalendar(UTC, Locale.ROOT);
    parsed.clear(); parsed.setLenient(false);
    int year = Integer.parseInt(date.substring(0, 4));
    if (year < 1) throw new IllegalArgumentException("Invalid skip year");
    parsed.set(year, Integer.parseInt(date.substring(5, 7)) - 1, Integer.parseInt(date.substring(8, 10)));
    parsed.getTimeInMillis(); // Force strict validation; Calendar rejects nonexistent month/day combinations.
  }

  private static boolean sameWall(Calendar a, Calendar b) {
    return a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.MONTH) == b.get(Calendar.MONTH)
      && a.get(Calendar.DAY_OF_MONTH) == b.get(Calendar.DAY_OF_MONTH)
      && a.get(Calendar.HOUR_OF_DAY) == b.get(Calendar.HOUR_OF_DAY)
      && a.get(Calendar.MINUTE) == b.get(Calendar.MINUTE)
      && a.get(Calendar.SECOND) == 0 && a.get(Calendar.MILLISECOND) == 0;
  }

  private static long wallCandidate(GregorianCalendar wall, TimeZone zone, long startAtMs, boolean anchorDay) {
    long guess = wall.getTimeInMillis();
    Set<Integer> offsets = new HashSet<>();
    // A fold exposes both surrounding offsets; a gap exposes none of its wall-time candidates.
    for (int hours = -36; hours <= 36; hours += 3) offsets.add(zone.getOffset(guess + hours * 3600000L));
    long earliest = Long.MAX_VALUE;
    boolean anchorMatches = false;
    for (int offset : offsets) {
      long candidate = guess - offset;
      if (!sameWall(calendar(zone, candidate), wall)) continue;
      earliest = Math.min(earliest, candidate);
      if (anchorDay && candidate == startAtMs) anchorMatches = true;
    }
    return anchorMatches ? startAtMs : earliest;
  }

  public static long nextFireAt(long nowMs, long startAtMs, String zoneName, int expoWeekday,
      int hour, int minute, int leadMinutes, List<String> skipDates) {
    if (startAtMs < 0 || expoWeekday < 1 || expoWeekday > 7 || hour < 0 || hour > 23
        || minute < 0 || minute > 59 || leadMinutes < 0 || leadMinutes > 525600
        || skipDates == null || skipDates.size() > 4096) {
      throw new IllegalArgumentException("Invalid Dailoop weekly trigger");
    }
    // TimeZone otherwise silently accepts an unknown ID as GMT; reject that fallback explicitly.
    if (zoneName == null || !ZONES.contains(zoneName)) throw new IllegalArgumentException("Invalid IANA zone");
    TimeZone zone = TimeZone.getTimeZone(zoneName);
    Set<String> skipped = new HashSet<>();
    for (String date : skipDates) {
      validateDate(date); skipped.add(date);
    }
    long leadMs = Math.multiplyExact((long) leadMinutes, 60000L);
    long reference = Math.addExact(nowMs, leadMs);
    String anchorDay = dateKey(calendar(zone, startAtMs));
    GregorianCalendar day = wallDate(calendar(zone, Math.max(reference, startAtMs)), 0, 0);
    day.add(Calendar.DAY_OF_MONTH, Math.floorMod(expoWeekday - day.get(Calendar.DAY_OF_WEEK), 7));
    // Rejected starting dates, skipped completions and a missing civil day move to a future week.
    for (int attempt = 0; attempt <= skipped.size() + 3; attempt++, day.add(Calendar.DAY_OF_MONTH, 7)) {
      String date = dateKey(day);
      if (skipped.contains(date)) continue;
      GregorianCalendar wall = wallDate(day, hour, minute);
      long due = wallCandidate(wall, zone, startAtMs, date.equals(anchorDay));
      // Match the application's spring-forward policy: first real minute, within 180 minutes.
      for (int advance = 0; due == Long.MAX_VALUE && advance < 180; advance++) {
        wall.add(Calendar.MINUTE, 1);
        due = wallCandidate(wall, zone, startAtMs, date.equals(anchorDay));
      }
      // An entire skipped civil date (e.g. Apia 2011-12-30) has no occurrence this week.
      if (due == Long.MAX_VALUE) continue;
      if (due < startAtMs || due <= reference) continue;
      return Math.subtractExact(due, leadMs);
    }
    throw new IllegalStateException("No next Dailoop weekly occurrence");
  }
}
