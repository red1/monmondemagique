package com.monmondemagique.app.storypack

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream

class StoryPackPipelineModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "StoryPackPipeline"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(true)
  }

  /** Required for NativeEventEmitter on Android. */
  @ReactMethod
  fun addListener(eventName: String) {
    // Keep: Required for RN built-in EventEmitter calls.
  }

  /** Required for NativeEventEmitter on Android. */
  @ReactMethod
  fun removeListeners(count: Int) {
    // Keep: Required for RN built-in EventEmitter calls.
  }

  @ReactMethod
  fun downloadDecryptAndUnzip(options: ReadableMap, promise: Promise) {
    val downloadUrl = options.getString("downloadUrl")
    val encryptedPath = options.getString("encryptedPath")?.let(::stripFileScheme)
    val destDir = options.getString("destDir")?.let(::stripFileScheme)
    val keyBase64 = options.getString("keyBase64")
    val totalBytes = if (options.hasKey("totalBytes")) options.getDouble("totalBytes").toLong() else 0L
    val packId = options.getString("packId") ?: ""

    if (downloadUrl.isNullOrBlank() || encryptedPath.isNullOrBlank()
      || destDir.isNullOrBlank() || keyBase64.isNullOrBlank()
    ) {
      promise.reject("INVALID_ARGS", "Missing downloadUrl, encryptedPath, destDir or keyBase64")
      return
    }

    executor.execute {
      try {
        val dest = File(destDir)
        if (!dest.exists()) dest.mkdirs()

        val encFile = File(encryptedPath)
        val zipFile = File(dest, "pack.zip")

        emitProgress(packId, 0.05, "downloading", totalBytes, 0L)
        downloadToFile(downloadUrl, encFile, totalBytes, packId)
        if (totalBytes > 0) {
          File(dest, ".pack.enc.meta").writeText("""{"size":$totalBytes}""")
        }

        emitProgress(packId, 0.58, "decrypting", totalBytes, totalBytes)
        val key = Base64.decode(keyBase64, Base64.DEFAULT)
        MegaCtrDecryptor(key).decryptFile(encFile, zipFile)

        encFile.delete()

        emitProgress(packId, 0.86, "unzipping", totalBytes, totalBytes)
        unzipToDirectory(zipFile, dest, packId)

        zipFile.delete()

        emitProgress(packId, 1.0, "saving", totalBytes, totalBytes)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("NATIVE_PIPELINE_FAILED", e.message, e)
      }
    }
  }

  @ReactMethod
  fun decryptToZip(options: ReadableMap, promise: Promise) {
    val encryptedPath = options.getString("encryptedPath")?.let(::stripFileScheme)
    val zipPath = options.getString("zipPath")?.let(::stripFileScheme)
    val keyBase64 = options.getString("keyBase64")
    val packId = options.getString("packId") ?: ""

    if (encryptedPath.isNullOrBlank() || zipPath.isNullOrBlank() || keyBase64.isNullOrBlank()) {
      promise.reject("INVALID_ARGS", "Missing encryptedPath, zipPath or keyBase64")
      return
    }

    executor.execute {
      try {
        val key = Base64.decode(keyBase64, Base64.DEFAULT)
        emitProgress(packId, 0.58, "decrypting", 0L, 0L)
        MegaCtrDecryptor(key).decryptFile(File(encryptedPath), File(zipPath))
        emitProgress(packId, 0.86, "decrypting", 0L, 0L)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("NATIVE_DECRYPT_FAILED", e.message, e)
      }
    }
  }

  @ReactMethod
  fun unzipDirectory(options: ReadableMap, promise: Promise) {
    val zipPath = options.getString("zipPath")?.let(::stripFileScheme)
    val destDir = options.getString("destDir")?.let(::stripFileScheme)
    val packId = options.getString("packId") ?: ""

    if (zipPath.isNullOrBlank() || destDir.isNullOrBlank()) {
      promise.reject("INVALID_ARGS", "Missing zipPath or destDir")
      return
    }

    executor.execute {
      try {
        emitProgress(packId, 0.86, "unzipping", 0L, 0L)
        unzipToDirectory(File(zipPath), File(destDir), packId)
        emitProgress(packId, 0.98, "extracting", 0L, 0L)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("NATIVE_UNZIP_FAILED", e.message, e)
      }
    }
  }

  @ReactMethod
  fun downloadFile(options: ReadableMap, promise: Promise) {
    val downloadUrl = options.getString("downloadUrl")
    val destPath = options.getString("destPath")?.let(::stripFileScheme)
    val totalBytes = if (options.hasKey("totalBytes")) options.getDouble("totalBytes").toLong() else 0L
    val packId = options.getString("packId") ?: ""

    if (downloadUrl.isNullOrBlank() || destPath.isNullOrBlank()) {
      promise.reject("INVALID_ARGS", "Missing downloadUrl or destPath")
      return
    }

    executor.execute {
      try {
        emitProgress(packId, 0.05, "downloading", totalBytes, 0L)
        downloadToFile(downloadUrl, File(destPath), totalBytes, packId)
        emitProgress(packId, 0.55, "downloading", totalBytes, totalBytes)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("NATIVE_DOWNLOAD_FAILED", e.message, e)
      }
    }
  }

  private fun downloadToFile(url: String, dest: File, totalBytes: Long, packId: String) {
    dest.parentFile?.mkdirs()
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      requestMethod = "GET"
      connectTimeout = 30_000
      readTimeout = 60_000
      instanceFollowRedirects = true
    }

    try {
      val code = connection.responseCode
      if (code >= 400) throw IllegalStateException("HTTP $code")
      val input = BufferedInputStream(connection.inputStream)
      dest.outputStream().use { output ->
        val buffer = ByteArray(1024 * 1024)
        var written = 0L
        var read: Int
        while (input.read(buffer).also { read = it } != -1) {
          output.write(buffer, 0, read)
          written += read
          val headerLength = connection.contentLengthLong
          val total = when {
            totalBytes > 0 -> totalBytes
            headerLength > 0 -> headerLength
            else -> written
          }
          val progress = 0.05 + (written.toDouble() / total.coerceAtLeast(1L)) * 0.5
          emitProgress(packId, progress, "downloading", total, written)
        }
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun unzipToDirectory(zipFile: File, destDir: File, packId: String) {
    if (!destDir.exists()) destDir.mkdirs()
    val zipSize = zipFile.length().coerceAtLeast(1L)
    var extracted = 0L

    ZipInputStream(BufferedInputStream(FileInputStream(zipFile))).use { zis ->
      var entry = zis.nextEntry
      val buffer = ByteArray(1024 * 1024)
      while (entry != null) {
        val outFile = File(destDir, entry.name)
        val destCanonical = destDir.canonicalPath + File.separator
        if (!outFile.canonicalPath.startsWith(destCanonical)) {
          throw SecurityException("Zip entry outside destination: ${entry.name}")
        }
        if (entry.isDirectory) {
          outFile.mkdirs()
        } else {
          outFile.parentFile?.mkdirs()
          outFile.outputStream().use { out ->
            var read: Int
            while (zis.read(buffer).also { read = it } != -1) {
              out.write(buffer, 0, read)
              extracted += read
              val progress = 0.86 + (extracted.toDouble() / zipSize) * 0.13
              emitProgress(packId, progress.coerceAtMost(0.99), "extracting", zipSize, extracted)
            }
          }
        }
        zis.closeEntry()
        entry = zis.nextEntry
      }
    }
  }

  private fun emitProgress(
    packId: String,
    progress: Double,
    status: String,
    totalBytes: Long,
    bytesWritten: Long,
  ) {
    val map = Arguments.createMap().apply {
      putString("packId", packId)
      putDouble("progress", progress)
      putString("status", status)
      putDouble("totalBytes", totalBytes.toDouble())
      putDouble("bytesWritten", bytesWritten.toDouble())
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("StoryPackNativeProgress", map)
  }

  private fun stripFileScheme(path: String): String {
    return if (path.startsWith("file://")) path.removePrefix("file://") else path
  }
}
