package com.monmondemagique.app.storymedia

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.monmondemagique.app.MainActivity
import com.monmondemagique.app.R
import java.net.URL
import java.util.concurrent.Executors

class StoryMediaSessionModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  companion object {
    const val NAME = "StoryMediaSession"
    private const val CHANNEL_ID = "story_media_playback"
    private const val NOTIFICATION_ID = 4242
    private const val ACTION_PLAY = "com.monmondemagique.app.storymedia.PLAY"
    private const val ACTION_PAUSE = "com.monmondemagique.app.storymedia.PAUSE"
    private const val ACTION_NEXT = "com.monmondemagique.app.storymedia.NEXT"
    private const val ACTION_PREV = "com.monmondemagique.app.storymedia.PREV"
  }

  private var mediaSession: MediaSessionCompat? = null
  private var isActive = false
  private var isPlaying = false
  private var positionMs = 0L
  private var durationMs = 0L
  private var title = "Magic World"
  private var artist: String? = null
  private var artworkUrl: String? = null
  private var artworkBitmap: Bitmap? = null
  private var canSkipNext = true
  private var canSkipPrevious = true
  private val mainHandler = Handler(Looper.getMainLooper())
  private val artworkExecutor = Executors.newSingleThreadExecutor()
  private var receiverRegistered = false

  private val actionReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        ACTION_PLAY -> emitCommand("play")
        ACTION_PAUSE -> emitCommand("pause")
        ACTION_NEXT -> emitCommand("next")
        ACTION_PREV -> emitCommand("previous")
      }
    }
  }

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun activate(options: ReadableMap, promise: Promise) {
    try {
      ensureChannel()
      ensureSession()
      applyOptions(options)
      registerReceiverIfNeeded()
      mediaSession?.isActive = true
      isActive = true
      updatePlaybackState()
      updateMetadata()
      showNotification()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ACTIVATE_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun update(options: ReadableMap, promise: Promise) {
    try {
      if (!isActive) {
        activate(options, promise)
        return
      }
      applyOptions(options)
      updatePlaybackState()
      updateMetadata()
      showNotification()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("UPDATE_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun deactivate(promise: Promise) {
    try {
      isActive = false
      isPlaying = false
      mediaSession?.isActive = false
      NotificationManagerCompat.from(reactContext).cancel(NOTIFICATION_ID)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("DEACTIVATE_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun addListener(eventName: String?) {
    // Required for NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for NativeEventEmitter
  }

  private fun applyOptions(options: ReadableMap) {
    if (options.hasKey("title") && !options.isNull("title")) {
      title = options.getString("title") ?: title
    }
    if (options.hasKey("artist")) {
      artist = if (options.isNull("artist")) null else options.getString("artist")
    }
    if (options.hasKey("isPlaying") && !options.isNull("isPlaying")) {
      isPlaying = options.getBoolean("isPlaying")
    }
    if (options.hasKey("positionMs") && !options.isNull("positionMs")) {
      positionMs = options.getDouble("positionMs").toLong().coerceAtLeast(0L)
    }
    if (options.hasKey("durationMs") && !options.isNull("durationMs")) {
      durationMs = options.getDouble("durationMs").toLong().coerceAtLeast(0L)
    }
    if (options.hasKey("canSkipNext") && !options.isNull("canSkipNext")) {
      canSkipNext = options.getBoolean("canSkipNext")
    }
    if (options.hasKey("canSkipPrevious") && !options.isNull("canSkipPrevious")) {
      canSkipPrevious = options.getBoolean("canSkipPrevious")
    }
    if (options.hasKey("artworkUrl")) {
      val nextUrl = if (options.isNull("artworkUrl")) null else options.getString("artworkUrl")
      if (nextUrl != artworkUrl) {
        artworkUrl = nextUrl
        loadArtwork(nextUrl)
      }
    }
  }

  private fun ensureSession() {
    if (mediaSession != null) return
    val session = MediaSessionCompat(reactContext, "StoryMediaSession")
    session.setCallback(object : MediaSessionCompat.Callback() {
      override fun onPlay() = emitCommand("play")
      override fun onPause() = emitCommand("pause")
      override fun onSkipToNext() = emitCommand("next")
      override fun onSkipToPrevious() = emitCommand("previous")
      override fun onSeekTo(pos: Long) {
        val map = Arguments.createMap()
        map.putString("command", "seek")
        map.putDouble("positionMs", pos.toDouble())
        sendEvent(map)
      }
      override fun onStop() = emitCommand("pause")
    })
    session.setFlags(
      MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
        MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
    )
    mediaSession = session
  }

  private fun updatePlaybackState() {
    val actions = PlaybackStateCompat.ACTION_PLAY or
      PlaybackStateCompat.ACTION_PAUSE or
      PlaybackStateCompat.ACTION_PLAY_PAUSE or
      PlaybackStateCompat.ACTION_SEEK_TO or
      (if (canSkipNext) PlaybackStateCompat.ACTION_SKIP_TO_NEXT else 0L) or
      (if (canSkipPrevious) PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS else 0L)

    val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
    val playbackState = PlaybackStateCompat.Builder()
      .setActions(actions)
      .setState(state, positionMs, if (isPlaying) 1f else 0f)
      .build()
    mediaSession?.setPlaybackState(playbackState)
  }

  private fun updateMetadata() {
    val builder = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
      .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, title)
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)

    if (!artist.isNullOrBlank()) {
      builder.putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
      builder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, artist)
    }
    artworkBitmap?.let {
      builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it)
      builder.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, it)
    }
    mediaSession?.setMetadata(builder.build())
  }

  private fun showNotification() {
    val session = mediaSession ?: return
    val contentIntent = PendingIntent.getActivity(
      reactContext,
      0,
      Intent(reactContext, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      pendingImmutableFlag(),
    )

    val builder = NotificationCompat.Builder(reactContext, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(artist ?: "Magic World")
      .setContentIntent(contentIntent)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setOngoing(isPlaying)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
      .setStyle(
        MediaStyle()
          .setMediaSession(session.sessionToken)
          .setShowActionsInCompactView(0, 1, 2)
      )

    artworkBitmap?.let { builder.setLargeIcon(it) }

    if (canSkipPrevious) {
      builder.addAction(
        NotificationCompat.Action(
          android.R.drawable.ic_media_previous,
          "Previous",
          actionPendingIntent(ACTION_PREV, 1),
        ),
      )
    }

    if (isPlaying) {
      builder.addAction(
        NotificationCompat.Action(
          android.R.drawable.ic_media_pause,
          "Pause",
          actionPendingIntent(ACTION_PAUSE, 2),
        ),
      )
    } else {
      builder.addAction(
        NotificationCompat.Action(
          android.R.drawable.ic_media_play,
          "Play",
          actionPendingIntent(ACTION_PLAY, 3),
        ),
      )
    }

    if (canSkipNext) {
      builder.addAction(
        NotificationCompat.Action(
          android.R.drawable.ic_media_next,
          "Next",
          actionPendingIntent(ACTION_NEXT, 4),
        ),
      )
    }

    val notification: Notification = builder.build()
    try {
      NotificationManagerCompat.from(reactContext).notify(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS may be missing on Android 13+ until granted
    }
  }

  private fun actionPendingIntent(action: String, requestCode: Int): PendingIntent {
    val intent = Intent(action).setPackage(reactContext.packageName)
    return PendingIntent.getBroadcast(
      reactContext,
      requestCode,
      intent,
      pendingImmutableFlag(),
    )
  }

  private fun pendingImmutableFlag(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Lecture d'histoires",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Contrôles de lecture sur l'écran de verrouillage"
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun registerReceiverIfNeeded() {
    if (receiverRegistered) return
    val filter = IntentFilter().apply {
      addAction(ACTION_PLAY)
      addAction(ACTION_PAUSE)
      addAction(ACTION_NEXT)
      addAction(ACTION_PREV)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(actionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      reactContext.registerReceiver(actionReceiver, filter)
    }
    receiverRegistered = true
  }

  private fun loadArtwork(url: String?) {
    if (url.isNullOrBlank()) {
      artworkBitmap = null
      return
    }
    artworkExecutor.execute {
      try {
        val path = if (url.startsWith("file://")) url.removePrefix("file://") else null
        val bitmap = if (path != null) {
          BitmapFactory.decodeFile(path)
        } else if (url.startsWith("http://") || url.startsWith("https://")) {
          URL(url).openStream().use { BitmapFactory.decodeStream(it) }
        } else {
          BitmapFactory.decodeFile(url)
        }
        mainHandler.post {
          artworkBitmap = bitmap
          if (isActive) {
            updateMetadata()
            showNotification()
          }
        }
      } catch (_: Exception) {
        // Keep previous artwork
      }
    }
  }

  private fun emitCommand(command: String) {
    val map = Arguments.createMap()
    map.putString("command", command)
    sendEvent(map)
  }

  private fun sendEvent(payload: WritableMap) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("storyMediaCommand", payload)
  }

  override fun onHostResume() {}
  override fun onHostPause() {}
  override fun onHostDestroy() {
    try {
      if (receiverRegistered) {
        reactContext.unregisterReceiver(actionReceiver)
        receiverRegistered = false
      }
    } catch (_: Exception) { /* ignore */ }
    NotificationManagerCompat.from(reactContext).cancel(NOTIFICATION_ID)
    mediaSession?.release()
    mediaSession = null
    isActive = false
  }
}
