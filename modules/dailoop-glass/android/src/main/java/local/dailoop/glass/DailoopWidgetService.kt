package local.dailoop.glass

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** User-triggered, bounded foreground work. No polling, remote fetch or permanent service. */
class DailoopWidgetService : HeadlessJsTaskService() {
  private val handler = Handler(Looper.getMainLooper())
  private val deadline = Runnable {
    val queue=DailoopWidgetState.pending(this)
    for(index in 0 until queue.length()) DailoopWidgetState.finish(this,queue.getJSONObject(index).getString("id"),false)
    DailoopWidgetProvider.updateAll(this)
    stopSelf()
  }
  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) {
      val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel("dailoop-native-actions", "Dailoop", NotificationManager.IMPORTANCE_LOW)
      channel.setSound(null, null); channel.enableVibration(false); channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
      val notification = Notification.Builder(this, channel.id).setSmallIcon(android.R.drawable.ic_menu_save)
        .setContentTitle("Dailoop").setContentText(DailoopWidgetState.copy(this, "service", getString(R.string.dailoop_widget_service)))
        .setOngoing(true).setOnlyAlertOnce(true).build()
      if (Build.VERSION.SDK_INT >= 34) startForeground(701, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)
      else startForeground(701, notification)
    }
    handler.postDelayed(deadline, 35000)
  }
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig = HeadlessJsTaskConfig("DailoopNativeActions", Arguments.createMap(), 30000, true)
  override fun onDestroy() {
    handler.removeCallbacks(deadline)
    val queue=DailoopWidgetState.pending(this)
    for(index in 0 until queue.length()) DailoopWidgetState.finish(this,queue.getJSONObject(index).getString("id"),false)
    if(queue.length()>0) DailoopWidgetProvider.updateAll(this)
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
