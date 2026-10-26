package io.github.quochuy2729.nghenhac.plugins

import android.content.Intent
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.getcapacitor.JSObject
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlin.math.pow

/** Cầu nối service → plugin (cùng tiến trình). Plugin gắn `sink` khi WebView còn sống. */
object PlayerBus {
    @Volatile var sink: ((String, JSObject) -> Unit)? = null

    fun emit(name: String, data: JSObject) {
        sink?.invoke(name, data)
    }
}

/**
 * Sở hữu ExoPlayer + MediaSession (notification, màn hình khóa, nút tai nghe/Bluetooth, audio focus,
 * tự dừng khi rút tai nghe). Tự chuyển bài khi app ở nền; ghi lượt nghe vào `PlayEventStore`.
 * G6: EQ, chuẩn hóa âm lượng theo bài, crossfade (2 ExoPlayer), hẹn giờ tắt — đều chạy native nên không phụ thuộc WebView.
 */
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null
    private lateinit var player: ExoPlayer
    private lateinit var attrs: AudioAttributes
    private val handler = Handler(Looper.getMainLooper())

    private class Cur(val id: String, val durationMs: Long) {
        var playedMs = 0L
        var lastPos = 0L
    }

    private var cur: Cur? = null
    private var liked = false
    private var errorSkip = false
    private var autoSkip = false

    // --- âm thanh (G6) ---
    private var equalizer: Equalizer? = null
    private var enhancer: LoudnessEnhancer? = null
    private var eqBands: DoubleArray? = null
    private var eqEnabled = false
    private var normalize = false
    private var gainVol = 1f
    private var fadeVol = 1f
    private var crossfadeMs = 0L
    private var secondary: ExoPlayer? = null
    private var fading = false
    private var sleepEndAt = 0L
    private var sleepEndOfTrack = false

    private val tick = object : Runnable {
        override fun run() {
            accumulate()
            checkSleep()
            maybeCrossfade()
            if (player.isPlaying) handler.postDelayed(this, TICK_MS)
        }
    }

    /** Cộng thời gian nghe thực: chỉ khi vị trí tăng đều (đoạn tua bị bỏ qua). */
    private fun accumulate() {
        val c = cur ?: return
        val pos = player.currentPosition
        val d = pos - c.lastPos
        if (d in 1..(TICK_MS * 3)) c.playedMs += d
        c.lastPos = pos
    }

    private fun finalizeCurrent(resetOnly: Boolean = false) {
        val c = cur ?: return
        accumulate()
        if (c.playedMs >= MIN_RECORD_MS) {
            PlayEventStore.add(applicationContext, c.id, c.playedMs, c.durationMs, System.currentTimeMillis())
        }
        if (resetOnly) {
            c.playedMs = 0
            c.lastPos = 0
        } else {
            cur = null
        }
    }

    // ---------------------------------------------------------------- âm lượng / hiệu ứng

    private fun applyVolume() {
        if (fading) return // đang crossfade: lớp fade tự điều khiển
        player.volume = (gainVol * fadeVol).coerceIn(0f, 1f)
    }

    /** Gain theo bài (dB) lấy từ extras của MediaItem: âm → giảm volume, dương → LoudnessEnhancer. */
    private fun applyItemGain(item: MediaItem?) {
        val db = if (normalize) (item?.mediaMetadata?.extras?.getDouble("gainDb", 0.0) ?: 0.0) else 0.0
        gainVol = if (db < 0) 10.0.pow(db / 20.0).toFloat() else 1f
        try {
            val e = enhancer
            if (e != null) {
                if (db > 0) {
                    e.setTargetGain((db * 100).toInt())
                    e.enabled = true
                } else {
                    e.setTargetGain(0)
                    e.enabled = false
                }
            }
        } catch (_: Exception) {
            // thiết bị không hỗ trợ
        }
        applyVolume()
    }

    private fun applyEqualizer() {
        val eq = equalizer ?: return
        val bands = eqBands
        try {
            if (!eqEnabled || bands == null) {
                eq.enabled = false
                return
            }
            val range = eq.bandLevelRange
            for (i in 0 until eq.numberOfBands) {
                val centerHz = eq.getCenterFreq(i.toShort()) / 1000
                val nearest = EQ_CENTERS.indices.minByOrNull { Math.abs(EQ_CENTERS[it] - centerHz) } ?: continue
                val level = ((bands.getOrElse(nearest) { 0.0 }) * 100).toInt().coerceIn(range[0].toInt(), range[1].toInt())
                eq.setBandLevel(i.toShort(), level.toShort())
            }
            eq.enabled = true
        } catch (_: Exception) {
            // thiết bị không hỗ trợ
        }
    }

    private fun rebuildEffects(sessionId: Int) {
        equalizer?.release()
        enhancer?.release()
        equalizer = null
        enhancer = null
        if (sessionId == C.AUDIO_SESSION_ID_UNSET) return
        try {
            equalizer = Equalizer(0, sessionId)
            enhancer = LoudnessEnhancer(sessionId)
        } catch (_: Exception) {
            // không có hiệu ứng trên thiết bị này
        }
        applyEqualizer()
        applyItemGain(player.currentMediaItem)
    }

    // ---------------------------------------------------------------- hẹn giờ tắt

    private fun clearSleep() {
        sleepEndAt = 0L
        sleepEndOfTrack = false
        fadeVol = 1f
        applyVolume()
        PlayerBus.emit("sleep", JSObject().put("active", false))
    }

    /** Hết giờ: giảm âm lượng dần trong 10 giây cuối rồi tạm dừng. "Hết bài này": hạ về 0 ở 400 ms cuối rồi dừng khi sang bài. */
    private fun checkSleep() {
        if (sleepEndAt > 0) {
            val remaining = sleepEndAt - System.currentTimeMillis()
            if (remaining <= 0) {
                player.pause()
                clearSleep()
            } else {
                fadeVol = if (remaining < FADE_MS) remaining.toFloat() / FADE_MS else 1f
                applyVolume()
            }
        } else if (sleepEndOfTrack) {
            val dur = player.duration
            if (dur != C.TIME_UNSET && dur - player.currentPosition < 400) {
                fadeVol = 0f
                applyVolume()
            }
        }
    }

    // ---------------------------------------------------------------- crossfade (2 ExoPlayer)

    /**
     * Bài hiện tại còn ≤ crossfadeMs: đẩy player chính sang bài kế (fade-in từ 0) và dùng player phụ phát nốt
     * bài cũ từ đúng vị trí đó (fade-out). Cùng album liền nhau thì thôi (để gapless).
     */
    private fun maybeCrossfade() {
        if (crossfadeMs <= 0 || fading || !player.isPlaying || !player.hasNextMediaItem() || sleepEndOfTrack) return
        val dur = player.duration
        if (dur == C.TIME_UNSET || dur <= crossfadeMs * 2) return
        if (dur - player.currentPosition > crossfadeMs) return
        val old = player.currentMediaItem ?: return
        val next = player.getMediaItemAt(player.nextMediaItemIndex)
        val a = old.mediaMetadata.albumTitle?.toString()
        if (!a.isNullOrEmpty() && a == next.mediaMetadata.albumTitle?.toString()) return
        startCrossfade(old, dur - player.currentPosition)
    }

    private fun startCrossfade(old: MediaItem, durationMs: Long) {
        val pos = player.currentPosition
        val oldVol = gainVol
        val sec = ExoPlayer.Builder(this).setAudioAttributes(attrs, /* handleAudioFocus = */ false).build()
        sec.setMediaItem(old)
        sec.prepare()
        sec.seekTo(pos)
        sec.volume = oldVol
        sec.play()
        secondary = sec
        fading = true
        autoSkip = true
        player.volume = 0f
        player.seekToNextMediaItem() // → onMediaItemTransition áp gain bài mới (gainVol)
        val started = System.currentTimeMillis()
        val step = object : Runnable {
            override fun run() {
                val s = secondary
                if (!fading || s == null) return
                val t = ((System.currentTimeMillis() - started).toFloat() / durationMs).coerceIn(0f, 1f)
                player.volume = (gainVol * fadeVol * t).coerceIn(0f, 1f)
                s.volume = (oldVol * (1 - t)).coerceIn(0f, 1f)
                if (t >= 1f) endCrossfade() else handler.postDelayed(this, 50)
            }
        }
        handler.post(step)
    }

    private fun endCrossfade() {
        fading = false
        secondary?.release()
        secondary = null
        applyVolume()
    }

    // ---------------------------------------------------------------- listener

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            finalizeCurrent()
            cur = mediaItem?.let { Cur(it.mediaId, it.mediaMetadata.durationMs ?: 0L) }?.also { it.lastPos = player.currentPosition }
            val why = when {
                errorSkip -> "error"
                autoSkip || reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO -> "auto"
                else -> "user"
            }
            errorSkip = false
            autoSkip = false
            applyItemGain(mediaItem)
            if (sleepEndOfTrack && reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                player.pause()
                clearSleep()
            }
            if (mediaItem != null) {
                PlayerBus.emit(
                    "trackChanged",
                    JSObject().put("index", player.currentMediaItemIndex).put("trackId", mediaItem.mediaId).put("reason", why),
                )
            }
        }

        override fun onAudioSessionIdChanged(audioSessionId: Int) {
            rebuildEffects(audioSessionId)
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            handler.removeCallbacks(tick)
            cur?.lastPos = player.currentPosition
            if (isPlaying) {
                if (sleepEndAt in 1..System.currentTimeMillis()) clearSleep() // hết giờ lúc đang tạm dừng
                handler.postDelayed(tick, TICK_MS)
            } else {
                accumulate()
                if (fading) endCrossfade()
            }
            emitState()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            emitState()
            if (playbackState == Player.STATE_ENDED) {
                finalizeCurrent(resetOnly = true)
                if (sleepEndOfTrack) clearSleep()
                PlayerBus.emit("ended", JSObject())
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            val id = player.currentMediaItem?.mediaId ?: ""
            PlayerBus.emit("error", JSObject().put("trackId", id).put("message", "Không phát được bài này (${error.errorCodeName})."))
            // File bị xóa / mất quyền: bỏ qua sang bài kế, không dừng cả hàng đợi.
            if (player.hasNextMediaItem()) {
                errorSkip = true
                player.seekToNextMediaItem()
                player.prepare()
                player.play()
            } else {
                finalizeCurrent()
            }
        }
    }

    private fun emitState() {
        PlayerBus.emit(
            "state",
            JSObject().put("playing", player.isPlaying).put("buffering", player.playbackState == Player.STATE_BUFFERING),
        )
    }

    private fun likeButton(): CommandButton =
        CommandButton.Builder(if (liked) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)
            .setDisplayName("Thích")
            .setSessionCommand(SessionCommand(CMD_TOGGLE_LIKE, Bundle.EMPTY))
            .build()

    private val callback = object : MediaSession.Callback {
        override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
            val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon().apply {
                CUSTOM_COMMANDS.forEach { add(SessionCommand(it, Bundle.EMPTY)) }
            }.build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session).setAvailableSessionCommands(commands).build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            when (customCommand.customAction) {
                CMD_TOGGLE_LIKE -> PlayerBus.emit(
                    "remote",
                    JSObject().put("action", "toggleLike").put("trackId", player.currentMediaItem?.mediaId ?: ""),
                )
                CMD_SET_LIKED -> {
                    liked = args.getBoolean("liked", false)
                    session.setCustomLayout(ImmutableList.of(likeButton()))
                }
                CMD_SET_EQ -> {
                    eqEnabled = args.getBoolean("enabled", false)
                    eqBands = args.getDoubleArray("bands")
                    applyEqualizer()
                }
                CMD_SET_NORMALIZE -> {
                    normalize = args.getBoolean("enabled", false)
                    applyItemGain(player.currentMediaItem)
                }
                CMD_SET_CROSSFADE -> crossfadeMs = args.getLong("ms", 0L).coerceIn(0L, 12_000L)
                CMD_SET_SLEEP -> {
                    sleepEndAt = args.getLong("endAt", 0L)
                    sleepEndOfTrack = args.getBoolean("endOfTrack", false)
                    if (sleepEndAt == 0L && !sleepEndOfTrack) clearSleep()
                    else {
                        fadeVol = 1f
                        applyVolume()
                        PlayerBus.emit("sleep", JSObject().put("active", true))
                    }
                }
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }

        // Controller gửi URI trong requestMetadata; đưa về localConfiguration để ExoPlayer phát được.
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> {
            val resolved = mediaItems.map {
                if (it.localConfiguration != null) it else it.buildUpon().setUri(it.requestMetadata.mediaUri).build()
            }.toMutableList()
            return Futures.immediateFuture(resolved)
        }
    }

    override fun onCreate() {
        super.onCreate()
        attrs = AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build()
        player = ExoPlayer.Builder(this)
            .setAudioAttributes(attrs, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()
        player.addListener(listener)
        session = MediaSession.Builder(this, player)
            .setCallback(callback)
            .setCustomLayout(ImmutableList.of(likeButton()))
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    // Vuốt app khỏi danh sách gần đây: đang phát thì cứ phát tiếp, không thì dừng service.
    override fun onTaskRemoved(rootIntent: Intent?) {
        if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        finalizeCurrent()
        secondary?.release()
        secondary = null
        equalizer?.release()
        enhancer?.release()
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }

    companion object {
        const val CMD_TOGGLE_LIKE = "toggleLike"
        const val CMD_SET_LIKED = "setLiked"
        const val CMD_SET_EQ = "setEq"
        const val CMD_SET_NORMALIZE = "setNormalize"
        const val CMD_SET_CROSSFADE = "setCrossfade"
        const val CMD_SET_SLEEP = "setSleep"
        private val CUSTOM_COMMANDS = listOf(CMD_TOGGLE_LIKE, CMD_SET_LIKED, CMD_SET_EQ, CMD_SET_NORMALIZE, CMD_SET_CROSSFADE, CMD_SET_SLEEP)
        /** Tâm 5 band của giao diện (Hz); band thật của thiết bị được ghép với tâm gần nhất. */
        private val EQ_CENTERS = intArrayOf(60, 230, 910, 3600, 14000)
        private const val TICK_MS = 250L
        private const val FADE_MS = 10_000L
        private const val MIN_RECORD_MS = 3000L
    }
}
