package com.marystig.vidafoodcaisse

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.marystig.vidafoodcaisse.print.EscPosBluetoothPrinter
import com.marystig.vidafoodcaisse.print.EscPosUsbPrinter
import com.marystig.vidafoodcaisse.print.PrintJobRepository
import com.marystig.vidafoodcaisse.print.PrintWorkerLoop
import com.marystig.vidafoodcaisse.print.PrinterLinkStatusHub
import com.marystig.vidafoodcaisse.print.WorkerConfig
import com.marystig.vidafoodcaisse.print.WorkerRuntime

/**
 * Foreground service that owns RFCOMM + print_jobs drain (Phase 1).
 */
class HubPrintWorkerService : Service() {
  companion object {
    const val CHANNEL_ID = "hub_print_channel"
    const val NOTIFICATION_ID = 4202
    const val ACTION_START = "com.marystig.vidafoodcaisse.action.START_WORKER"
    const val ACTION_STOP = "com.marystig.vidafoodcaisse.action.STOP_WORKER"
    private const val TAG = "HubPrintWorkerSvc"

    fun start(ctx: Context) {
      val i = Intent(ctx, HubPrintWorkerService::class.java).setAction(ACTION_START)
      androidx.core.content.ContextCompat.startForegroundService(ctx, i)
    }

    fun stop(ctx: Context) {
      val i = Intent(ctx, HubPrintWorkerService::class.java).setAction(ACTION_STOP)
      ctx.startService(i)
    }
  }

  private var loop: PrintWorkerLoop? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null
  private var linkReceiversRegistered = false

  private val linkHotplugReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val action = intent?.action ?: return
      when (action) {
        UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
          val device = usbDeviceFrom(intent) ?: return
          Log.i(TAG, "USB_DEVICE_ATTACHED · ${device.vendorId}:${device.productId}")
          PrinterLinkStatusHub.onUsbAttached(device.vendorId, device.productId)
          loop?.onUsbDeviceAttached(device)
        }
        UsbManager.ACTION_USB_DEVICE_DETACHED -> {
          val device = usbDeviceFrom(intent) ?: return
          Log.i(TAG, "USB_DEVICE_DETACHED · ${device.vendorId}:${device.productId}")
          PrinterLinkStatusHub.onUsbDetached(device.vendorId, device.productId)
          loop?.onUsbDeviceDetached(device)
        }
        BluetoothDevice.ACTION_ACL_CONNECTED -> {
          val mac = btMacFrom(intent) ?: return
          PrinterLinkStatusHub.onBtAclConnected(mac)
        }
        BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
          val mac = btMacFrom(intent) ?: return
          PrinterLinkStatusHub.onBtAclDisconnected(mac)
        }
      }
    }
  }

  private fun usbDeviceFrom(intent: Intent): UsbDevice? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(UsbManager.EXTRA_DEVICE) as? UsbDevice
    }
  }

  private fun btMacFrom(intent: Intent): String? {
    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE) as? BluetoothDevice
    }
    return device?.address
  }

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    registerLinkReceivers()
  }

  private fun registerLinkReceivers() {
    if (linkReceiversRegistered) return
    val filter = IntentFilter().apply {
      addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
      addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
      addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(linkHotplugReceiver, filter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(linkHotplugReceiver, filter)
    }
    linkReceiversRegistered = true
  }

  private fun unregisterLinkReceivers() {
    if (!linkReceiversRegistered) return
    try {
      unregisterReceiver(linkHotplugReceiver)
    } catch (_: Exception) {
      /* ignore */
    }
    linkReceiversRegistered = false
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        teardown("stop-action")
        stopForegroundCompat()
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        val notification = buildNotification(0, null)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          startForeground(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
          )
        } else {
          startForeground(NOTIFICATION_ID, notification)
        }
        startLoopIfNeeded()
      }
    }
    return START_STICKY
  }

  private fun startLoopIfNeeded() {
    if (loop?.isRunning() == true) return
    if (!WorkerConfig.isConfigured(this) || !WorkerConfig.isEnabled(this)) {
      Log.w(TAG, "not configured/enabled — stopping")
      updateNotification(0, "Non configuré")
      stopForegroundCompat()
      stopSelf()
      return
    }
    val url = WorkerConfig.supabaseUrl(this)!!
    val key = WorkerConfig.anonKey(this)!!
    val deviceId = WorkerConfig.deviceId(this)!!

    acquireWakeLock()
    val usbPrinter = EscPosUsbPrinter(applicationContext)
    val repo = PrintJobRepository(url, key, deviceId)
    val appCtx = applicationContext
    val worker = PrintWorkerLoop(
      repo = repo,
      btPrinterFactory = { persistent -> EscPosBluetoothPrinter(appCtx, persistent) },
      usbPrinter = usbPrinter,
      initialLaneMode = WorkerConfig.laneMode(appCtx),
      persistLaneMode = { mode -> WorkerConfig.setLaneMode(appCtx, mode) },
    ) { running, depth, err ->
      WorkerRuntime.running = running
      WorkerRuntime.queueDepth = depth
      WorkerRuntime.lastError = err
      updateNotification(depth, err)
    }
    loop = worker
    WorkerRuntime.loop = worker
    worker.start()
    Log.i(TAG, "worker loop started · device=$deviceId · usb+bt")
  }

  private fun teardown(reason: String) {
    Log.i(TAG, "teardown · $reason")
    loop?.stop()
    loop = null
    WorkerRuntime.loop = null
    WorkerRuntime.running = false
    WorkerConfig.setEnabled(this, false)
    releaseWakeLock()
  }

  /**
   * Wi-Fi power-save let TAB19 stay "associated" while unable to reach even its
   * router (2026-10-09: DNS + gateway dead until Wi-Fi was toggled). The hub must
   * reach Supabase 24/7, so keep the radio in full-power mode while it runs.
   */
  private fun acquireWifiLock() {
    if (wifiLock?.isHeld == true) return
    val wm = applicationContext.getSystemService(WIFI_SERVICE) as? WifiManager ?: return
    val mode =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) WifiManager.WIFI_MODE_FULL_LOW_LATENCY
      else @Suppress("DEPRECATION") WifiManager.WIFI_MODE_FULL_HIGH_PERF
    wifiLock = wm.createWifiLock(mode, "vidafood:HubPrintWifi").also {
      it.setReferenceCounted(false)
      it.acquire()
    }
  }

  private fun releaseWifiLock() {
    try {
      if (wifiLock?.isHeld == true) wifiLock?.release()
    } catch (_: Exception) {
      /* ignore */
    }
    wifiLock = null
  }

  private fun acquireWakeLock() {
    acquireWifiLock()
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vidafood:HubPrintWorker")
      .also {
        it.setReferenceCounted(false)
        it.acquire(10 * 60 * 60 * 1000L) // 10h max; renewed by sticky restart
      }
  }

  private fun releaseWakeLock() {
    releaseWifiLock()
    try {
      if (wakeLock?.isHeld == true) wakeLock?.release()
    } catch (_: Exception) {
      /* ignore */
    }
    wakeLock = null
  }

  override fun onDestroy() {
    unregisterLinkReceivers()
    teardown("onDestroy")
    stopForegroundCompat()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Hub d'impression",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Worker natif d'impression USB + Bluetooth"
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  @Volatile private var lastNotifiedDepth = -1
  @Volatile private var lastNotifiedError: String? = null
  @Volatile private var lastNotifiedAt = 0L

  /**
   * onStatus fires from several threads up to ~20×/s; Android rate-limits
   * notification updates, so only push changes, at most every 500ms.
   */
  private fun updateNotification(depth: Int, error: String?) {
    val now = System.currentTimeMillis()
    if (depth == lastNotifiedDepth && error == lastNotifiedError) return
    if (now - lastNotifiedAt < 500L) return
    lastNotifiedDepth = depth
    lastNotifiedError = error
    lastNotifiedAt = now
    val nm = getSystemService(NotificationManager::class.java) ?: return
    nm.notify(NOTIFICATION_ID, buildNotification(depth, error))
  }

  private fun buildNotification(depth: Int, error: String?): Notification {
    val launch = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    var piFlags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      piFlags = piFlags or PendingIntent.FLAG_IMMUTABLE
    }
    val contentIntent = PendingIntent.getActivity(this, 0, launch, piFlags)
    val status = when {
      !error.isNullOrBlank() -> "File: $depth · $error"
      depth > 0 -> "File: $depth · impression…"
      else -> "File: 0 · OK"
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Impression hub — USB + Bluetooth")
      .setContentText(status)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(contentIntent)
      .build()
  }
}
