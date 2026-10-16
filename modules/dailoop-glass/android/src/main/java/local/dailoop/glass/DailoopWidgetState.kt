package local.dailoop.glass

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Disposable widget cache/outbox only. Canonical SQLite is exclusively written by the JS store. */
internal object DailoopWidgetState {
  private fun preferences(context: Context) = context.getSharedPreferences("dailoop_widgets_v1", Context.MODE_PRIVATE)
  private val uuid = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
  fun isId(value: String) = uuid.matches(value)
  private var cachedSource: String? = null
  private var cachedSnapshot: JSONObject? = null
  @Synchronized fun snapshot(context: Context): JSONObject {
    val source = preferences(context).getString("snapshot", "{}") ?: "{}"
    if (source == cachedSource) cachedSnapshot?.let { return it }
    val parsed = try { JSONObject(source) } catch (_: Exception) { JSONObject() }
    cachedSource = source; cachedSnapshot = parsed
    return parsed
  }
  @Synchronized fun publish(context: Context, json: String) {
    require(json.toByteArray(Charsets.UTF_8).size <= 2 * 1024 * 1024)
    val value = JSONObject(json)
    require(value.optInt("schema") == 1 && isId(value.optString("databaseId")))
    val activities = value.getJSONArray("activities")
    require(activities.length() <= 10000)
    for (i in 0 until activities.length()) {
      val item = activities.getJSONObject(i)
      require(isId(item.optString("id")) && item.getString("name").length <= 8192 && item.getString("emoji").length <= 256)
    }
    check(preferences(context).edit().putString("snapshot", value.toString()).commit())
    cachedSource=null;cachedSnapshot=null
  }
  @Synchronized fun selected(context: Context, widgetId: Int): List<String> = try {
    val values = JSONArray(preferences(context).getString("selected_$widgetId", "[]")!!)
    (0 until values.length()).map { values.getString(it) }.filter(::isId).distinct().take(4)
  } catch (_: Exception) { emptyList() }
  @Synchronized fun select(context: Context, widgetId: Int, ids: List<String>) {
    require(ids.size in 1..4 && ids.all(::isId))
    check(preferences(context).edit().putString("selected_$widgetId", JSONArray(ids.distinct()).toString()).commit())
  }
  @Synchronized fun remove(context: Context, widgetId: Int) { preferences(context).edit().remove("selected_$widgetId").apply() }
  @Synchronized fun token(context: Context, widgetId: Int, activityId: String): String {
    val key = "token_${widgetId}_$activityId"
    val saved = preferences(context).getString(key, null)
    if (saved != null && isId(saved)) return saved
    val next = UUID.randomUUID().toString()
    check(preferences(context).edit().putString(key, next).commit())
    return next
  }
  @Synchronized fun validToken(context: Context, widgetId: Int, activityId: String, token: String) = preferences(context).getString("token_${widgetId}_$activityId", null) == token
  @Synchronized fun pending(context: Context): JSONArray = try { JSONArray(preferences(context).getString("pending", "[]")!!) } catch (_: Exception) { JSONArray() }
  private fun seen(context: Context): List<String> = try {
    val array = JSONArray(preferences(context).getString("seen", "[]")!!)
    (0 until array.length()).map { array.getString(it) }
  } catch (_: Exception) { emptyList() }
  @Synchronized fun enqueue(context: Context, action: JSONObject): Boolean {
    val id = action.getString("id")
    require(isId(id) && isId(action.getString("databaseId")))
    require(action.getLong("occurredAtMs") >= 0)
    require(action.getString("kind") in listOf("record", "reminder-done", "reminder-snooze", "reminder-skip"))
    if (id in seen(context)) return false
    val queue = pending(context)
    // A repeated OS delivery must reuse the first captured tap time, even after process death.
    for (i in 0 until queue.length()) if (queue.getJSONObject(i).getString("id") == id) return true
    require(queue.length() < 64)
    queue.put(action)
    check(preferences(context).edit().putString("pending", queue.toString()).putString("status", "pending").commit())
    return true
  }
  @Synchronized fun finish(context: Context, id: String, ok: Boolean, discard: Boolean = false) {
    require(isId(id))
    val editor = preferences(context).edit()
    var successfulKind: String? = null
    var remaining = pending(context).length()
    if (ok || discard) {
      val next = JSONArray()
      val queue = pending(context)
      for (i in 0 until queue.length()) {
        val item = queue.getJSONObject(i)
        if (item.getString("id") != id) next.put(item) else successfulKind = item.optString("kind")
      }
      remaining = next.length()
      editor.putString("pending", next.toString()).putString("seen", JSONArray((seen(context) + id).distinct().takeLast(128)).toString())
      for ((key, value) in preferences(context).all) if (key.startsWith("token_") && value == id) editor.remove(key)
    }
    // Failed/uncertain work remains durable with the same operation ID for the next retry.
    val status = when {
      discard -> "error"
      !ok -> "error"
      remaining > 0 -> "pending"
      successfulKind == "record" || successfulKind == "reminder-done" -> "success"
      else -> ""
    }
    editor.putString("status", status)
    check(editor.commit())
  }
  fun status(context: Context): String = preferences(context).getString("status", "") ?: ""
  @Synchronized fun clear(context: Context) { check(preferences(context).edit().clear().commit());cachedSource=null;cachedSnapshot=null }
  fun copy(context: Context, key: String, fallback: String): String = snapshot(context).optJSONObject("copy")?.optString(key, fallback) ?: fallback
}
