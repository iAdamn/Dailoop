package local.dailoop.glass

import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray

/** Native chooser can run before the React activity and never writes the canonical database. */
class DailoopWidgetConfigActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setResult(RESULT_CANCELED)
    val widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    val pin = intent.getBooleanExtra("pin", false)
    if (!pin && widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
    if (!pin && widgetId !in AppWidgetManager.getInstance(this).getAppWidgetIds(ComponentName(this,DailoopWidgetProvider::class.java))) { finish(); return }
    val snapshot = DailoopWidgetState.snapshot(this)
    val activities = snapshot.optJSONArray("activities")
    val items = (0 until (activities?.length() ?: 0)).map { activities!!.getJSONObject(it) }
    val selected = DailoopWidgetState.selected(this, widgetId).toMutableSet()
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; setPadding(36, 40, 36, 32)
      background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.rgb(75,63,115), Color.rgb(35,38,58))).apply { cornerRadius = 36f }
    }
    layout.addView(TextView(this).apply { text = DailoopWidgetState.copy(this@DailoopWidgetConfigActivity, "visible", getString(R.string.dailoop_widget_visible)); setTextColor(Color.rgb(235,229,255)); textSize = 15f; setPadding(0,0,0,24) })
    if (items.isEmpty()) {
      AlertDialog.Builder(this).setTitle("Dailoop").setMessage(DailoopWidgetState.copy(this,"empty",getString(R.string.dailoop_widget_empty)))
        .setPositiveButton(android.R.string.ok) { _, _ ->
          packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }; finish()
        }.setOnCancelListener { finish() }.show()
      return
    }
    val labels = items.map { "${it.getString("emoji")}  ${it.getString("name")}${if (it.optBoolean("isPrivate")) " · ${DailoopWidgetState.copy(this, "private", "Privada")}" else ""}" }.toTypedArray()
    val checked = items.map { it.getString("id") in selected }.toBooleanArray()
    val dialog = AlertDialog.Builder(this).setTitle(DailoopWidgetState.copy(this,"choose",getString(R.string.dailoop_widget_choose)))
      .setView(layout).setMultiChoiceItems(labels, checked) { dialog, index, isChecked ->
        val id = items[index].getString("id")
        if (isChecked && selected.size >= 4) (dialog as AlertDialog).listView.setItemChecked(index, false)
        else if (isChecked) selected.add(id) else selected.remove(id)
        (dialog as AlertDialog).getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = selected.isNotEmpty()
      }.setPositiveButton(DailoopWidgetState.copy(this,"done",getString(R.string.dailoop_widget_done)), null)
      .setNegativeButton(android.R.string.cancel) { _, _ -> finish() }.setOnCancelListener { finish() }.create()
    dialog.setOnShowListener {
      dialog.window?.setBackgroundDrawable(GradientDrawable().apply { setColor(Color.rgb(35,38,58)); cornerRadius=36f })
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = selected.isNotEmpty()
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
        val chosen = items.map { it.getString("id") }.filter { it in selected }.take(4)
        if (pin) pinWidget(chosen) else {
          DailoopWidgetState.select(this, widgetId, chosen)
          DailoopWidgetProvider.update(this, AppWidgetManager.getInstance(this), widgetId)
          setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)); finish()
        }
      }
    }
    dialog.show()
  }
  private fun pinWidget(selected: List<String>) {
    if (Build.VERSION.SDK_INT < 26) { finish(); return }
    val callback = Intent(this, DailoopWidgetPinReceiver::class.java).putExtra("selected", JSONArray(selected).toString())
    // Launcher inserts EXTRA_APPWIDGET_ID into this explicit, package-private completion callback.
    val success = PendingIntent.getBroadcast(this, 707, callback, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
    AppWidgetManager.getInstance(this).requestPinAppWidget(ComponentName(this,DailoopWidgetProvider::class.java), null, success)
    finish()
  }
}

/** Mutable only because Android must append the newly allocated widget ID. Explicit component/nonexported. */
class DailoopWidgetPinReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      val widgetId=intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,AppWidgetManager.INVALID_APPWIDGET_ID)
      val manager=AppWidgetManager.getInstance(context)
      require(widgetId in manager.getAppWidgetIds(ComponentName(context,DailoopWidgetProvider::class.java)))
      val values=JSONArray(intent.getStringExtra("selected")?:"[]")
      val chosen=(0 until values.length()).map { values.getString(it) }
      DailoopWidgetState.select(context,widgetId,chosen)
      DailoopWidgetProvider.update(context,manager,widgetId)
    } catch (_: Exception) { /* An incomplete launcher response cannot change data. */ }
  }
}
