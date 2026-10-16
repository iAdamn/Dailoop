package local.dailoop.glass

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews

class DailoopWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val installed=manager.getAppWidgetIds(ComponentName(context,DailoopWidgetProvider::class.java))
    ids.filter { it in installed }.forEach { update(context, manager, it) }
  }
  override fun onDeleted(context: Context, ids: IntArray) {
    val installed=AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context,DailoopWidgetProvider::class.java))
    ids.filter { it !in installed }.forEach { DailoopWidgetState.remove(context, it) }
  }
  companion object {
    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      manager.getAppWidgetIds(ComponentName(context, DailoopWidgetProvider::class.java)).forEach { update(context, manager, it) }
    }
    fun update(context: Context, manager: AppWidgetManager, widgetId: Int) {
      val snapshot = DailoopWidgetState.snapshot(context)
      val activities = snapshot.optJSONArray("activities")
      val chosen = DailoopWidgetState.selected(context, widgetId)
      val items = (0 until (activities?.length() ?: 0)).map { activities!!.getJSONObject(it) }.filter { it.optString("id") in chosen }.sortedBy { chosen.indexOf(it.optString("id")) }.take(4)
      val views = RemoteViews(context.packageName, R.layout.dailoop_widget)
      val config = Intent(context, DailoopWidgetConfigActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId).setData(Uri.parse("dailoop-widget://configure/$widgetId"))
      views.setOnClickPendingIntent(R.id.dailoop_widget_configure, PendingIntent.getActivity(context, widgetId, config, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      views.setTextViewText(R.id.dailoop_widget_configure, DailoopWidgetState.copy(context, "configure", context.getString(R.string.dailoop_widget_configure)))
      val status = DailoopWidgetState.status(context)
      views.setTextViewText(R.id.dailoop_widget_status, if (items.isEmpty()) DailoopWidgetState.copy(context, "empty", context.getString(R.string.dailoop_widget_empty)) else DailoopWidgetState.copy(context, status, ""))
      val rows = intArrayOf(R.id.dailoop_widget_row1, R.id.dailoop_widget_row2, R.id.dailoop_widget_row3, R.id.dailoop_widget_row4)
      val labels = intArrayOf(R.id.dailoop_widget_label1, R.id.dailoop_widget_label2, R.id.dailoop_widget_label3, R.id.dailoop_widget_label4)
      val times = intArrayOf(R.id.dailoop_widget_time1, R.id.dailoop_widget_time2, R.id.dailoop_widget_time3, R.id.dailoop_widget_time4)
      for (index in 0..3) {
        views.setViewVisibility(rows[index], if (index < items.size) View.VISIBLE else View.GONE)
        if (index >= items.size) continue
        val item = items[index]
        val activityId = item.getString("id")
        views.setTextViewText(labels[index], "${item.getString("emoji")}  ${item.getString("name")}")
        views.setTextViewText(times[index], "${item.getString("last")}  ·  ${DailoopWidgetState.copy(context, "record", "Registrar")}")
        views.setContentDescription(rows[index], "${DailoopWidgetState.copy(context, "record", "Registrar")}: ${item.getString("name")}, ${item.getString("last")}")
        val action = Intent(context, DailoopWidgetActionReceiver::class.java).setAction("local.dailoop.WIDGET_RECORD")
          .setData(Uri.parse("dailoop-widget://record/$widgetId/$activityId"))
          .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId).putExtra("activityId", activityId)
          .putExtra("databaseId", snapshot.optString("databaseId")).putExtra("operationId", DailoopWidgetState.token(context, widgetId, activityId))
        views.setOnClickPendingIntent(rows[index], PendingIntent.getBroadcast(context, widgetId * 10 + index, action, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      manager.updateAppWidget(widgetId, views)
    }
  }
}
