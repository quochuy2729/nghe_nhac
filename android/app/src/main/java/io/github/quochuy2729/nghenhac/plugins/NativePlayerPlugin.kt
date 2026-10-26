package io.github.quochuy2729.nghenhac.plugins

import android.content.ComponentName
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionToken
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.PluginMethod
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject

/**
 * Điều khiển PlaybackService qua MediaController. JS chỉ đẩy "cửa sổ" hàng đợi; chuyển bài, notification,
 * audio focus do service xử lý nên vẫn chạy khi màn hình tắt. Hợp đồng: src/platform/android/nativePlayer.ts.
 */
@CapacitorPlugin(name = "NativePlayer")
class NativePlayerPlugin : Plugin() {
    private val main = Handler(Looper.getMainLooper())
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var uiVisible = true

    private val positionLoop = object : Runnable {
        override fun run() {
            val c = controllerFuture?.takeIf { it.isDone }?.get()
            if (c != null && uiVisible && c.isPlaying) {
                notifyListeners("position", JSObject().put("sec", c.currentPosition / 1000.0).put("durationSec", durationSec(c)))
            }
            main.postDelayed(this, POSITION_MS)
        }
    }

    override fun load() {
        PlayerBus.sink = { name, data -> notifyListeners(name, data) }
        main.post(positionLoop)
    }

    override fun handleOnDestroy() {
        PlayerBus.sink = null
        main.removeCallbacks(positionLoop)
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controllerFuture = null
    }

    private fun durationSec(c: MediaController): Double {
        val d = c.duration
        return if (d == androidx.media3.common.C.TIME_UNSET || d < 0) 0.0 else d / 1000.0
    }

    private fun ensureController(): ListenableFuture<MediaController> {
        controllerFuture?.let { return it }
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        return MediaController.Builder(context, token).setApplicationLooper(Looper.getMainLooper()).buildAsync().also {
            controllerFuture = it
        }
    }

    /** Chạy `block` trên luồng chính khi controller đã kết nối. */
    private fun withController(call: PluginCall, block: (MediaController) -> Unit) {
        main.post {
            val f = ensureController()
            f.addListener(
                {
                    try {
                        block(f.get())
                    } catch (e: Exception) {
                        call.reject(e.message ?: "Lỗi trình phát")
                    }
                },
                ContextCompat.getMainExecutor(context),
            )
        }
    }

    private fun toItem(o: JSONObject): MediaItem {
        val uri = Uri.parse(o.getString("uri"))
        val meta = MediaMetadata.Builder()
            .setTitle(o.optString("title"))
            .setArtist(o.optString("artist"))
            .setAlbumTitle(o.optString("album").ifEmpty { null })
            .setDurationMs(o.optLong("durationMs", 0L))
        o.optString("artworkUri").takeIf { it.isNotEmpty() }?.let { meta.setArtworkUri(Uri.parse(it)) }
        return MediaItem.Builder()
            .setMediaId(o.getString("id"))
            .setUri(uri)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(uri).build())
            .setMediaMetadata(meta.build())
            .build()
    }

    private fun items(call: PluginCall): List<MediaItem> {
        val arr = call.getArray("items") ?: JSArray()
        return (0 until arr.length()).map { toItem(arr.getJSONObject(it)) }
    }

    @PluginMethod
    fun setWindow(call: PluginCall) {
        val list = items(call)
        val start = call.getInt("startIndex", 0) ?: 0
        val startMs = (call.getDouble("startMs", 0.0) ?: 0.0).toLong()
        withController(call) { c ->
            if (list.isEmpty()) {
                c.stop()
                c.clearMediaItems()
            } else {
                c.setMediaItems(list, start.coerceIn(0, list.size - 1), startMs)
                c.prepare()
            }
            call.resolve()
        }
    }

    /** Thêm bài vào cuối cửa sổ (đang phát không bị gián đoạn). */
    @PluginMethod
    fun appendWindow(call: PluginCall) {
        val list = items(call)
        withController(call) { c ->
            c.addMediaItems(list)
            call.resolve()
        }
    }

    /** Thay toàn bộ các bài SAU bài đang phát (hàng đợi đổi: phát tiếp theo, xóa, sắp xếp, xáo). */
    @PluginMethod
    fun setUpcoming(call: PluginCall) {
        val list = items(call)
        withController(call) { c ->
            val from = c.currentMediaItemIndex + 1
            if (from < c.mediaItemCount) c.removeMediaItems(from, c.mediaItemCount)
            c.addMediaItems(list)
            call.resolve()
        }
    }

    @PluginMethod
    fun play(call: PluginCall) = withController(call) { c ->
        if (c.playbackState == Player.STATE_IDLE) c.prepare()
        c.play()
        call.resolve()
    }

    @PluginMethod
    fun pause(call: PluginCall) = withController(call) { c ->
        c.pause()
        call.resolve()
    }

    @PluginMethod
    fun seek(call: PluginCall) {
        val ms = ((call.getDouble("sec", 0.0) ?: 0.0) * 1000).toLong()
        withController(call) { c ->
            c.seekTo(ms)
            call.resolve()
        }
    }

    @PluginMethod
    fun skipTo(call: PluginCall) {
        val index = call.getInt("index", 0) ?: 0
        withController(call) { c ->
            if (index in 0 until c.mediaItemCount) c.seekTo(index, 0L)
            call.resolve()
        }
    }

    @PluginMethod
    fun getState(call: PluginCall) = withController(call) { c ->
        call.resolve(
            JSObject()
                .put("playing", c.isPlaying)
                .put("buffering", c.playbackState == Player.STATE_BUFFERING)
                .put("index", if (c.mediaItemCount == 0) -1 else c.currentMediaItemIndex)
                .put("trackId", c.currentMediaItem?.mediaId ?: "")
                .put("sec", c.currentPosition / 1000.0)
                .put("durationSec", durationSec(c)),
        )
    }

    /** Lấy (và xóa) các lượt nghe native đã ghi, kể cả lúc app ở nền. */
    @PluginMethod
    fun drainEvents(call: PluginCall) {
        call.resolve(JSObject().put("events", PlayEventStore.drain(context)))
    }

    /** Chỉ bắn sự kiện vị trí khi WebView đang hiện (tiết kiệm pin). */
    @PluginMethod
    fun setUiVisible(call: PluginCall) {
        uiVisible = call.getBoolean("visible", true) ?: true
        call.resolve()
    }

    @PluginMethod
    fun setLiked(call: PluginCall) {
        val liked = call.getBoolean("liked", false) ?: false
        withController(call) { c ->
            val args = android.os.Bundle().apply { putBoolean("liked", liked) }
            c.sendCustomCommand(SessionCommand(PlaybackService.CMD_SET_LIKED, android.os.Bundle.EMPTY), args)
            call.resolve()
        }
    }

    companion object {
        private const val POSITION_MS = 250L
    }
}
