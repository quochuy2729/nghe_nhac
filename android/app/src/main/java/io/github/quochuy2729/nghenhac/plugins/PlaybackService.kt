package io.github.quochuy2729.nghenhac.plugins

import android.content.Intent
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
 */
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null
    private lateinit var player: ExoPlayer
    private val handler = Handler(Looper.getMainLooper())

    private class Cur(val id: String, val durationMs: Long) {
        var playedMs = 0L
        var lastPos = 0L
    }

    private var cur: Cur? = null
    private var liked = false
    private var errorSkip = false

    private val tick = object : Runnable {
        override fun run() {
            accumulate()
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

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            finalizeCurrent()
            cur = mediaItem?.let { Cur(it.mediaId, it.mediaMetadata.durationMs ?: 0L) }?.also { it.lastPos = player.currentPosition }
            val why = when {
                errorSkip -> "error"
                reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO -> "auto"
                else -> "user"
            }
            errorSkip = false
            if (mediaItem != null) {
                PlayerBus.emit(
                    "trackChanged",
                    JSObject().put("index", player.currentMediaItemIndex).put("trackId", mediaItem.mediaId).put("reason", why),
                )
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            handler.removeCallbacks(tick)
            cur?.lastPos = player.currentPosition
            if (isPlaying) handler.postDelayed(tick, TICK_MS) else accumulate()
            emitState()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            emitState()
            if (playbackState == Player.STATE_ENDED) {
                finalizeCurrent(resetOnly = true)
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
            val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                .add(SessionCommand(CMD_TOGGLE_LIKE, Bundle.EMPTY))
                .add(SessionCommand(CMD_SET_LIKED, Bundle.EMPTY))
                .build()
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
        val attrs = AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build()
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
        handler.removeCallbacks(tick)
        finalizeCurrent()
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
        private const val TICK_MS = 500L
        private const val MIN_RECORD_MS = 3000L
    }
}
