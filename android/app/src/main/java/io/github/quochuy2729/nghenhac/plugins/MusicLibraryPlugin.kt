package io.github.quochuy2729.nghenhac.plugins

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.PluginMethod
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.text.Normalizer
import java.util.ArrayDeque
import java.util.concurrent.Callable
import java.util.concurrent.Executors

/**
 * Đọc thư mục nhạc qua Storage Access Framework (không sao chép file).
 * Hợp đồng với JS: src/platform/android/musicLibrary.ts. Id bài do JS tính (src/lib/id.ts).
 */
@CapacitorPlugin(name = "MusicLibrary")
class MusicLibraryPlugin : Plugin() {
    private val prefs by lazy { context.getSharedPreferences("music_library", Context.MODE_PRIVATE) }

    private fun readFolders(): List<Pair<String, String>> {
        val arr = JSONArray(prefs.getString("folders", "[]"))
        return (0 until arr.length()).map { i -> arr.getJSONObject(i).let { it.getString("id") to it.getString("label") } }
    }

    private fun writeFolders(list: List<Pair<String, String>>) {
        val arr = JSONArray()
        list.forEach { arr.put(JSONObject().put("id", it.first).put("label", it.second)) }
        prefs.edit().putString("folders", arr.toString()).apply()
    }

    private fun folderLabel(tree: Uri): String {
        val docId = DocumentsContract.getTreeDocumentId(tree) // "primary:Music/Pop"
        val tail = docId.substringAfter(':', docId).trimEnd('/').substringAfterLast('/')
        return tail.ifEmpty { "Bộ nhớ trong" }
    }

    @PluginMethod
    fun pickFolder(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                Intent.FLAG_GRANT_PREFIX_URI_PERMISSION,
        )
        startActivityForResult(call, intent, "onFolderPicked")
    }

    @ActivityCallback
    private fun onFolderPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val tree = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || tree == null) {
            call.resolve(JSObject().put("folder", JSONObject.NULL))
            return
        }
        try {
            context.contentResolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val id = tree.toString()
            val label = folderLabel(tree)
            writeFolders(readFolders().filter { it.first != id } + (id to label))
            call.resolve(JSObject().put("folder", JSObject().put("id", id).put("label", label)))
        } catch (e: Exception) {
            call.reject("Không cấp được quyền thư mục: ${e.message}")
        }
    }

    @PluginMethod
    fun listFolders(call: PluginCall) {
        val granted = context.contentResolver.persistedUriPermissions.filter { it.isReadPermission }.map { it.uri.toString() }.toSet()
        val arr = JSArray()
        readFolders().forEach { (id, label) ->
            arr.put(JSObject().put("id", id).put("label", label).put("accessible", id in granted))
        }
        call.resolve(JSObject().put("folders", arr))
    }

    @PluginMethod
    fun removeFolder(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("thiếu id")
        try {
            context.contentResolver.releasePersistableUriPermission(Uri.parse(id), Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: Exception) {
            // quyền đã mất từ trước: vẫn xóa khỏi danh sách
        }
        writeFolders(readFolders().filter { it.first != id })
        call.resolve()
    }

    private class Entry(val docId: String, val name: String, val size: Long, val mtime: Long)

    /**
     * Duyệt cả cây thư mục, bắn từng lô ≤ 200 file qua sự kiện `scanBatch` {scanId, items}.
     * Dùng DocumentsContract trực tiếp (DocumentFile chậm vì mỗi thuộc tính là một truy vấn).
     * Trả đủ danh sách (không lọc theo mtime) để JS phát hiện bài biến mất.
     */
    @PluginMethod
    fun scan(call: PluginCall) {
        val folderId = call.getString("folderId") ?: return call.reject("thiếu folderId")
        val scanId = call.getString("scanId") ?: ""
        val tree = Uri.parse(folderId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        )
        var batch = JSArray()
        var total = 0
        fun flush() {
            if (batch.length() == 0) return
            notifyListeners("scanBatch", JSObject().put("scanId", scanId).put("items", batch))
            batch = JSArray()
        }
        try {
            val queue = ArrayDeque<Pair<String, String>>()
            queue.add(DocumentsContract.getTreeDocumentId(tree) to "")
            while (queue.isNotEmpty()) {
                val (dirId, relDir) = queue.poll()!!
                val audio = ArrayList<Entry>()
                val lrcByBase = HashMap<String, Entry>()
                val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dirId)
                val cursor = context.contentResolver.query(childrenUri, projection, null, null, null)
                    ?: throw IllegalStateException("không mở được thư mục")
                cursor.use { c ->
                    while (c.moveToNext()) {
                        val docId = c.getString(0) ?: continue
                        val name = c.getString(1) ?: continue
                        val mime = c.getString(2) ?: ""
                        if (name.startsWith(".")) continue
                        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                            queue.add(docId to if (relDir.isEmpty()) name else "$relDir/$name")
                            continue
                        }
                        val e = Entry(docId, name, if (c.isNull(3)) 0 else c.getLong(3), if (c.isNull(4)) 0 else c.getLong(4))
                        when {
                            name.endsWith(".lrc", ignoreCase = true) -> lrcByBase[baseKey(name)] = e
                            isAudio(name, mime) -> audio.add(e)
                        }
                    }
                }
                for (e in audio) {
                    val item = JSObject()
                        .put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, e.docId).toString())
                        .put("relDir", relDir)
                        .put("name", e.name)
                        .put("size", e.size)
                        .put("mtime", e.mtime)
                    lrcByBase[baseKey(e.name)]?.let {
                        item.put("lrcUri", DocumentsContract.buildDocumentUriUsingTree(tree, it.docId).toString())
                        item.put("lrcMtime", it.mtime)
                    }
                    batch.put(item)
                    total++
                    if (batch.length() >= SCAN_BATCH) flush()
                }
            }
            flush()
            call.resolve(JSObject().put("total", total))
        } catch (e: Exception) {
            call.reject("Không quét được thư mục: ${e.message}")
        }
    }

    private fun baseKey(name: String): String =
        Normalizer.normalize(name.substringBeforeLast('.'), Normalizer.Form.NFC).lowercase()

    /** Chỉ nhận audio: bỏ video/ảnh dù đuôi file có giống nhạc (vd .mp4). */
    private fun isAudio(name: String, mime: String): Boolean {
        if (mime.startsWith("audio/")) return true
        if (mime.startsWith("video/") || mime.startsWith("image/")) return false
        return AUDIO_EXT.any { name.endsWith(it, ignoreCase = true) }
    }

    /** Đọc tag (song song 4 luồng, giữ nguyên thứ tự). Mỗi phần tử lỗi vẫn có `uri` và `ok:false`. */
    @PluginMethod
    fun readTags(call: PluginCall) {
        val uris = call.getArray("uris") ?: return call.reject("thiếu uris")
        val list = (0 until uris.length()).map { uris.getString(it) }
        val pool = Executors.newFixedThreadPool(4)
        try {
            val results = pool.invokeAll(list.map { u -> Callable { readOne(u) } }).map { it.get() }
            val arr = JSArray()
            results.forEach { arr.put(it) }
            call.resolve(JSObject().put("tags", arr))
        } catch (e: Exception) {
            call.reject("Không đọc được tag: ${e.message}")
        } finally {
            pool.shutdown()
        }
    }

    private fun readOne(uriStr: String): JSObject {
        val out = JSObject().put("uri", uriStr)
        val mmr = MediaMetadataRetriever()
        try {
            mmr.setDataSource(context, Uri.parse(uriStr))
            fun meta(key: Int): String? = mmr.extractMetadata(key)?.trim()?.takeIf { it.isNotEmpty() }
            meta(MediaMetadataRetriever.METADATA_KEY_TITLE)?.let { out.put("title", it) }
            meta(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.let { out.put("artist", it) }
            meta(MediaMetadataRetriever.METADATA_KEY_ALBUM)?.let { out.put("album", it) }
            meta(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST)?.let { out.put("albumArtist", it) }
            meta(MediaMetadataRetriever.METADATA_KEY_GENRE)?.let { out.put("genre", it) }
            (meta(MediaMetadataRetriever.METADATA_KEY_YEAR) ?: meta(MediaMetadataRetriever.METADATA_KEY_DATE))
                ?.let { Regex("\\d{4}").find(it)?.value?.toIntOrNull() }?.let { out.put("year", it) }
            meta(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.let { out.put("durationSec", it / 1000.0) }
            mmr.embeddedPicture?.let { bytes -> coverFile(uriStr, bytes)?.let { out.put("artworkPath", it.absolutePath) } }
            out.put("ok", true)
        } catch (e: Exception) {
            out.put("ok", false)
        } finally {
            try { mmr.release() } catch (_: Exception) {}
        }
        return out
    }

    /** Ảnh bìa vuông 300px, lưu trong cache (hệ điều hành có thể dọn; `artwork` sẽ tạo lại). */
    private fun coverFile(uriStr: String, bytes: ByteArray): File? {
        val dir = File(context.cacheDir, "covers").apply { mkdirs() }
        val file = File(dir, sha1(uriStr) + ".jpg")
        if (file.exists() && file.length() > 0) return file
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (minOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= COVER_SIZE) sample *= 2
        val src = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: return null
        val side = minOf(src.width, src.height)
        val square = Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
        val scaled = Bitmap.createScaledBitmap(square, COVER_SIZE, COVER_SIZE, true)
        file.outputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, 80, it) }
        if (scaled !== square) square.recycle()
        if (square !== src) src.recycle()
        scaled.recycle()
        return file
    }

    private fun sha1(s: String): String =
        MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

    /** Đường dẫn ảnh bìa trong cache của một file (tạo lại nếu đã bị dọn). */
    @PluginMethod
    fun artwork(call: PluginCall) {
        val uri = call.getString("uri") ?: return call.reject("thiếu uri")
        val mmr = MediaMetadataRetriever()
        try {
            mmr.setDataSource(context, Uri.parse(uri))
            val path = mmr.embeddedPicture?.let { coverFile(uri, it)?.absolutePath }
            call.resolve(JSObject().put("path", path ?: JSONObject.NULL))
        } catch (e: Exception) {
            call.resolve(JSObject().put("path", JSONObject.NULL))
        } finally {
            try { mmr.release() } catch (_: Exception) {}
        }
    }

    /** Đọc file lời `.lrc` (UTF-8, tối đa 512 KB). */
    @PluginMethod
    fun readText(call: PluginCall) {
        val uri = call.getString("uri") ?: return call.reject("thiếu uri")
        try {
            // InputStream.readNBytes cần API 33, minSdk là 23 → đọc tay có giới hạn.
            val bytes = context.contentResolver.openInputStream(Uri.parse(uri))?.use { input ->
                val buf = java.io.ByteArrayOutputStream()
                val chunk = ByteArray(8192)
                while (buf.size() < MAX_TEXT_BYTES) {
                    val n = input.read(chunk)
                    if (n < 0) break
                    buf.write(chunk, 0, n)
                }
                buf.toByteArray()
            }
            val text = bytes?.toString(Charsets.UTF_8)?.removePrefix("﻿")
            call.resolve(JSObject().put("text", text ?: JSONObject.NULL))
        } catch (e: Exception) {
            call.resolve(JSObject().put("text", JSONObject.NULL))
        }
    }

    private var pcmCounter = 0

    /**
     * Giải mã đoạn [startSec, startSec+durSec) thành PCM mono int16 @ sampleRate (MediaExtractor + MediaCodec),
     * ghi ra file trong cache; JS đọc lại qua convertFileSrc (tránh nhồi vài MB base64 qua cầu nối).
     */
    @PluginMethod
    fun decodeSegment(call: PluginCall) {
        val uri = call.getString("uri") ?: return call.reject("thiếu uri")
        val startSec = call.getDouble("startSec", 0.0) ?: 0.0
        val durSec = call.getDouble("durSec", 45.0) ?: 45.0
        val outRate = call.getInt("sampleRate", 22050) ?: 22050
        try {
            val file = decodeToMono16(Uri.parse(uri), startSec, durSec, outRate)
            call.resolve(JSObject().put("path", file.absolutePath).put("samples", file.length() / 2))
        } catch (e: Exception) {
            call.reject("Không giải mã được: ${e.message}")
        }
    }

    private fun decodeToMono16(uri: Uri, startSec: Double, durSec: Double, outRate: Int): File {
        val extractor = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            extractor.setDataSource(context, uri, null)
            var trackIdx = -1
            var format: MediaFormat? = null
            for (i in 0 until extractor.trackCount) {
                val f = extractor.getTrackFormat(i)
                if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
                    trackIdx = i
                    format = f
                    break
                }
            }
            if (trackIdx < 0 || format == null) throw IllegalStateException("không có luồng audio")
            extractor.selectTrack(trackIdx)
            val startUs = (startSec * 1_000_000).toLong()
            val endUs = ((startSec + durSec) * 1_000_000).toLong()
            extractor.seekTo(startUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)

            val c = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
            codec = c
            c.configure(format, null, null, 0)
            c.start()

            var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            var pcmFloat = false
            var mono = FloatArray(rate * (durSec.toInt() + 2))
            var n = 0
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            var outputDone = false
            val deadline = System.currentTimeMillis() + 30_000
            while (!outputDone && System.currentTimeMillis() < deadline) {
                if (!inputDone) {
                    val idx = c.dequeueInputBuffer(10_000)
                    if (idx >= 0) {
                        val buf = c.getInputBuffer(idx)!!
                        val size = extractor.readSampleData(buf, 0)
                        if (size < 0 || extractor.sampleTime > endUs) {
                            c.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            c.queueInputBuffer(idx, 0, size, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }
                val out = c.dequeueOutputBuffer(info, 10_000)
                if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    val f = c.outputFormat
                    rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    pcmFloat = f.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                        f.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
                } else if (out >= 0) {
                    val buf = c.getOutputBuffer(out)!!
                    if (info.size > 0 && info.presentationTimeUs >= startUs) {
                        buf.position(info.offset)
                        buf.limit(info.offset + info.size)
                        val bo = buf.slice().order(ByteOrder.nativeOrder())
                        val frames = info.size / (if (pcmFloat) 4 else 2) / channels
                        if (n + frames > mono.size) mono = mono.copyOf((n + frames) * 2)
                        for (i in 0 until frames) {
                            var sum = 0f
                            for (ch in 0 until channels) sum += if (pcmFloat) bo.getFloat() else bo.getShort() / 32768f
                            mono[n++] = sum / channels
                        }
                    }
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
                    c.releaseOutputBuffer(out, false)
                }
            }

            // Lấy mẫu lại tuyến tính về outRate rồi ghi int16 little-endian.
            val outCount = (n.toLong() * outRate / rate).toInt()
            val bytes = ByteBuffer.allocate(outCount * 2).order(ByteOrder.LITTLE_ENDIAN)
            for (i in 0 until outCount) {
                val pos = i.toDouble() * rate / outRate
                val i0 = pos.toInt().coerceAtMost(n - 1)
                val i1 = (i0 + 1).coerceAtMost(n - 1)
                val v = mono[i0] + (mono[i1] - mono[i0]) * (pos - i0).toFloat()
                bytes.putShort((v.coerceIn(-1f, 1f) * 32767).toInt().toShort())
            }
            val dir = File(context.cacheDir, "pcm").apply { mkdirs() }
            dir.listFiles()?.forEach { it.delete() } // chỉ giữ file của lần gọi này
            val file = File(dir, "pcm-${++pcmCounter}.raw")
            file.writeBytes(bytes.array())
            return file
        } finally {
            try { codec?.stop() } catch (_: Exception) {}
            try { codec?.release() } catch (_: Exception) {}
            extractor.release()
        }
    }

    companion object {
        private const val SCAN_BATCH = 200
        private const val COVER_SIZE = 300
        private const val MAX_TEXT_BYTES = 512 * 1024
        private val AUDIO_EXT = listOf(".mp3", ".m4a", ".aac", ".flac", ".ogg", ".oga", ".opus", ".wav")
    }
}
