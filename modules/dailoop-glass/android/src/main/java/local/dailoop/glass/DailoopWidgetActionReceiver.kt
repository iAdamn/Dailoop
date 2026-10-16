package local.dailoop.glass

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import java.nio.ByteBuffer

/** Only our immutable widget PendingIntents and package-private notification bridge can reach this receiver. */
class DailoopWidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    var accepted: JSONObject? = null
    try {
      val notification = intent.getBundleExtra("dailoopNotificationResponse")
      val action = if (notification != null) notificationAction(notification) else widgetAction(context, intent)
      accepted = action
      if (DailoopWidgetState.enqueue(context, action)) start(context)
      DailoopWidgetProvider.updateAll(context)
    } catch (_: Exception) {
      // FGS launch can be denied by Android. Keep the original durable operation for an app-open retry.
      accepted?.optString("id")?.takeIf { DailoopWidgetState.isId(it) }?.let { id ->
        runCatching { DailoopWidgetState.finish(context,id,false); DailoopWidgetProvider.updateAll(context) }
      }
    }
  }
  private fun widgetAction(context: Context, intent: Intent): JSONObject {
    require(intent.action == "local.dailoop.WIDGET_RECORD")
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    val installed = AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, DailoopWidgetProvider::class.java))
    require(widgetId in installed)
    val activityId = intent.getStringExtra("activityId") ?: ""
    val token = intent.getStringExtra("operationId") ?: ""
    require(activityId in DailoopWidgetState.selected(context, widgetId) && DailoopWidgetState.validToken(context, widgetId, activityId, token))
    val databaseId = intent.getStringExtra("databaseId") ?: ""
    require(databaseId == DailoopWidgetState.snapshot(context).optString("databaseId"))
    return JSONObject().put("id", token).put("kind", "record").put("databaseId", databaseId).put("activityId", activityId).put("occurredAtMs", System.currentTimeMillis())
  }
  private fun notificationAction(response: Bundle): JSONObject {
    val action = response.getString("actionIdentifier") ?: ""
    val kind = when (action) {
      "dailoop.v070.done" -> "reminder-done"
      "dailoop.v070.skip" -> "reminder-skip"
      "dailoop.v070.snooze10", "dailoop.v070.snooze30", "dailoop.v070.snooze60" -> "reminder-snooze"
      else -> throw IllegalArgumentException("Unsupported notification action")
    }
    val notification = response.getBundle("notification") ?: throw IllegalArgumentException()
    val request = notification.getBundle("request") ?: throw IllegalArgumentException()
    val identifier = request.getString("identifier") ?: ""
    require(identifier.startsWith("dailoop:"))
    val content = request.getBundle("content") ?: throw IllegalArgumentException()
    val raw = content.get("data")
    val data = when (raw) { is Bundle -> JSONObject().also { json -> for (key in raw.keySet()) json.put(key, raw.get(key)) }; is String -> JSONObject(raw); else -> throw IllegalArgumentException() }
    require(data.optString("kind") == "reminder")
    val databaseId = data.getString("databaseId")
    val reminderId = data.getString("reminderId")
    val activityId = data.getString("activityId")
    require(DailoopWidgetState.isId(databaseId) && DailoopWidgetState.isId(reminderId) && DailoopWidgetState.isId(activityId))
    val deliveredAt = notification.getLong("date", 0)
    require(deliveredAt > 0)
    val dueAt = data.getLong("dueAtMs")
    val bytes = MessageDigest.getInstance("SHA-256").digest("$identifier|$deliveredAt|$action".toByteArray(Charsets.UTF_8)).copyOf(16)
    bytes[6] = ((bytes[6].toInt() and 15) or 64).toByte(); bytes[8] = ((bytes[8].toInt() and 63) or 128).toByte()
    val buffer = ByteBuffer.wrap(bytes)
    return JSONObject().put("id", UUID(buffer.long, buffer.long).toString()).put("kind", kind).put("databaseId", databaseId)
      .put("reminderId", reminderId).put("activityId", activityId).put("dueAtMs", dueAt).put("occurredAtMs", System.currentTimeMillis())
      .put("deliveredAtMs", deliveredAt).put("notificationIdentifier", identifier)
      .also {
        if (kind == "reminder-snooze") it.put("minutes", action.removePrefix("dailoop.v070.snooze").toInt())
        for (key in listOf("weeklyOccurrence", "recurrenceWeekday", "leadMinutes", "recurrenceAnchorAtMs", "recurrenceZone", "recurrenceHour", "recurrenceMinute", "scheduledAtMs")) if (data.has(key)) it.put(key, data.get(key))
      }
  }
  companion object {
    fun start(context: Context) {
      val intent = Intent(context, DailoopWidgetService::class.java)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      HeadlessJsTaskService.acquireWakeLockNow(context)
    }
  }
}
