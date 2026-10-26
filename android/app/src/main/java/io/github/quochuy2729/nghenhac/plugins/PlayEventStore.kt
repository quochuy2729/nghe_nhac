package io.github.quochuy2729.nghenhac.plugins

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Hàng chờ lượt nghe do native ghi (kể cả khi WebView đã bị hệ điều hành dọn), JS lấy ra bằng `drain`.
 * Lưu SharedPreferences nên sống sót cả khi tiến trình bị kill; `drain` đọc và xóa trong một khóa.
 */
object PlayEventStore {
    private const val PREFS = "play_events"
    private const val KEY = "queue"
    private const val MAX_EVENTS = 2000

    fun add(ctx: Context, trackId: String, playedMs: Long, durationMs: Long, endedAt: Long) {
        synchronized(this) {
            val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val arr = JSONArray(prefs.getString(KEY, "[]"))
            arr.put(
                JSONObject()
                    .put("trackId", trackId)
                    .put("playedMs", playedMs)
                    .put("durationMs", durationMs)
                    .put("endedAt", endedAt),
            )
            // Giữ các lượt mới nhất nếu JS lâu không lấy.
            val kept = if (arr.length() > MAX_EVENTS) {
                JSONArray().also { out -> for (i in arr.length() - MAX_EVENTS until arr.length()) out.put(arr.get(i)) }
            } else {
                arr
            }
            prefs.edit().putString(KEY, kept.toString()).commit()
        }
    }

    fun drain(ctx: Context): JSONArray {
        synchronized(this) {
            val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val arr = JSONArray(prefs.getString(KEY, "[]"))
            if (arr.length() > 0) prefs.edit().remove(KEY).commit()
            return arr
        }
    }
}
