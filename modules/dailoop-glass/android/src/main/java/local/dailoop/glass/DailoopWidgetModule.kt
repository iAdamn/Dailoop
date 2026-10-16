package local.dailoop.glass

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class DailoopWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DailoopWidgets")
    Events("onActionsAvailable")
    AsyncFunction("publishSnapshot") { json: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("No native context")
      DailoopWidgetState.publish(context, json); DailoopWidgetProvider.updateAll(context)
    }
    AsyncFunction("requestPin") {
      val activity = appContext.currentActivity
      if (activity == null || Build.VERSION.SDK_INT < 26 || !AppWidgetManager.getInstance(activity).isRequestPinAppWidgetSupported) false
      else { activity.startActivity(Intent(activity,DailoopWidgetConfigActivity::class.java).putExtra("pin",true)); true }
    }
    AsyncFunction("pendingActions") {
      val context = appContext.reactContext ?: throw IllegalStateException("No native context")
      DailoopWidgetState.pending(context).toString()
    }
    AsyncFunction("finishAction") { id: String, ok: Boolean ->
      val context = appContext.reactContext ?: throw IllegalStateException("No native context")
      DailoopWidgetState.finish(context,id,ok)
      // A launcher/widget deletion race cannot turn a confirmed native ack into a JS failure.
      runCatching { DailoopWidgetProvider.updateAll(context) }
    }
    AsyncFunction("discardAction") { id: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("No native context")
      DailoopWidgetState.finish(context,id,false,true)
      runCatching { DailoopWidgetProvider.updateAll(context) }
    }
    AsyncFunction("enqueueAction") { json: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("No native context")
      require(json.length <= 16384)
      if (DailoopWidgetState.enqueue(context,JSONObject(json))) {
        sendEvent("onActionsAvailable",emptyMap<String,Any>())
        DailoopWidgetProvider.updateAll(context)
      }
    }
    AsyncFunction("clear") {
      val context = appContext.reactContext ?: throw IllegalStateException("No native context")
      DailoopWidgetState.clear(context); DailoopWidgetProvider.updateAll(context)
    }
  }
}
