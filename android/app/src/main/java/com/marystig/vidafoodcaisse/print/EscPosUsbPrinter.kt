package com.marystig.vidafoodcaisse.print

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import android.util.Log
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * USB Host ESC/POS sender (OTG). Prefers USB Printer class (0x07), else any bulk OUT.
 * Holds an open connection for keep-alive reuse while the same VID/PID stays attached.
 * Hot-plug: detach closes the session; attach / next job re-opens without Admin Connect.
 */
class EscPosUsbPrinter(private val appContext: Context) {
  companion object {
    private const val TAG = "EscPosUsb"
    private const val ACTION_USB_PERMISSION =
      "com.marystig.vidafoodcaisse.USB_PERMISSION"
    private const val PREFS = "escpos_usb"
    private const val KEY_LAST_VID = "last_vendor_id"
    private const val KEY_LAST_PID = "last_product_id"
    const val TRANSFER_TIMEOUT_MS = 5_000
    const val CHUNK_SIZE = 16_384
    const val CHUNK_GAP_MS = 5L
    const val KEEPALIVE_MS = 60_000L
    const val PERMISSION_WAIT_MS = 45_000L
    /** Enumeration can lag a few hundred ms after ACTION_USB_DEVICE_ATTACHED. */
    private const val ENUM_RETRY_COUNT = 5
    private const val ENUM_RETRY_GAP_MS = 200L
  }

  data class UsbDeviceInfo(
    val vendorId: Int,
    val productId: Int,
    val deviceName: String,
    val productName: String?,
    val hasPermission: Boolean,
  )

  data class SendTiming(
    val connectMs: Long,
    val writeMs: Long,
    val reused: Boolean,
  )

  private data class LiveSession(
    val vendorId: Int,
    val productId: Int,
    val device: UsbDevice,
    val connection: UsbDeviceConnection,
    val usbInterface: UsbInterface,
    val endpoint: UsbEndpoint,
    val openedAt: Long,
  )

  private val usbManager =
    appContext.getSystemService(Context.USB_SERVICE) as UsbManager

  private val prefs =
    appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Volatile private var live: LiveSession? = null

  fun listDevices(): List<UsbDeviceInfo> {
    return usbManager.deviceList.values.map { d ->
      UsbDeviceInfo(
        vendorId = d.vendorId,
        productId = d.productId,
        deviceName = d.deviceName,
        productName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          d.productName
        } else {
          null
        },
        hasPermission = usbManager.hasPermission(d),
      )
    }.sortedWith(compareBy({ it.vendorId }, { it.productId }))
  }

  fun forceClose(reason: String) {
    Log.i(TAG, "forceClose · $reason")
    closeLive()
  }

  fun closeIfKeepaliveExpired() {
    val session = live ?: return
    val age = System.currentTimeMillis() - session.openedAt
    if (age >= KEEPALIVE_MS) {
      Log.i(TAG, "keepalive expired · ${hexId(session.vendorId, session.productId)} · ${age}ms")
      closeLive()
    }
  }

  fun onDeviceDetached(device: UsbDevice) {
    val session = live
    if (session != null && matchesSession(session, device)) {
      Log.w(TAG, "USB detached · ${hexId(session.vendorId, session.productId)}")
      closeLive()
      PrinterLinkStatusHub.onUsbDetached(device.vendorId, device.productId)
      return
    }
    // Stale live with same VID/PID under a different deviceName
    if (session != null &&
      session.vendorId == device.vendorId &&
      session.productId == device.productId
    ) {
      Log.w(TAG, "USB detached (vid/pid) · ${hexId(device.vendorId, device.productId)}")
      closeLive()
    }
    PrinterLinkStatusHub.onUsbDetached(device.vendorId, device.productId)
  }

  /**
   * Called from BroadcastReceiver / MainActivity on ACTION_USB_DEVICE_ATTACHED.
   * Requests permission (auto-granted when device_filter matched) and warm-opens
   * if this is the last-known Caisse printer.
   */
  fun onDeviceAttached(device: UsbDevice) {
    Log.i(
      TAG,
      "USB attached · ${hexId(device.vendorId, device.productId)} · ${device.deviceName}",
    )
    PrinterLinkStatusHub.onUsbAttached(device.vendorId, device.productId)
    val session = live
    if (session != null &&
      session.vendorId == device.vendorId &&
      session.productId == device.productId
    ) {
      // Old connection handle is invalid after unplug — always reset.
      closeLive()
    }

    if (!looksLikePrinter(device) && !isLastKnown(device.vendorId, device.productId)) {
      Log.i(TAG, "ignore non-printer USB attach")
      return
    }

    try {
      ensurePermission(device)
    } catch (e: Exception) {
      Log.w(TAG, "attach permission: ${e.message}")
      return
    }

    if (!isLastKnown(device.vendorId, device.productId)) {
      Log.i(TAG, "permission ready · warm open deferred (not last Caisse)")
      return
    }

    try {
      ensureSession("USB/Caisse", device.vendorId, device.productId)
      Log.i(TAG, "warm reconnect OK · ${hexId(device.vendorId, device.productId)}")
    } catch (e: Exception) {
      Log.w(TAG, "warm reconnect deferred: ${e.message}")
    }
  }

  /** Permission + open only (no write). */
  fun probeConnect(printerName: String, vendorId: Int, productId: Int) {
    ensureSession(printerName, vendorId, productId)
    Log.i(TAG, "PROBE OK · $printerName · ${hexId(vendorId, productId)}")
  }

  fun sendEscPos(
    printerName: String,
    vendorId: Int,
    productId: Int,
    dataBase64: String,
  ): SendTiming {
    val raw = Base64.decode(dataBase64, Base64.DEFAULT)
    if (raw.isEmpty()) throw IOException("Payload ESC/POS vide")

    var lastError: Exception? = null
    // One reopen pass covers stale keep-alive after silent detach / cable bounce.
    repeat(2) { attempt ->
      try {
        return sendOnce(printerName, vendorId, productId, raw, attempt > 0)
      } catch (e: Exception) {
        lastError = e
        Log.w(TAG, "send attempt ${attempt + 1} failed · ${e.message}")
        closeLive()
        if (attempt == 0) {
          Thread.sleep(ENUM_RETRY_GAP_MS)
        }
      }
    }
    throw (lastError ?: IOException("Erreur impression USB"))
  }

  private fun sendOnce(
    printerName: String,
    vendorId: Int,
    productId: Int,
    raw: ByteArray,
    forceReopen: Boolean,
  ): SendTiming {
    var reused = false
    var connectMs = 0L
    val existing = live
    val session = if (
      !forceReopen &&
      existing != null &&
      existing.vendorId == vendorId &&
      existing.productId == productId &&
      isSessionAlive(existing) &&
      (System.currentTimeMillis() - existing.openedAt) < KEEPALIVE_MS
    ) {
      reused = true
      Log.i(TAG, "REUSE · $printerName · ${hexId(vendorId, productId)}")
      existing
    } else {
      val t0 = System.currentTimeMillis()
      val opened = ensureSession(printerName, vendorId, productId)
      connectMs = System.currentTimeMillis() - t0
      opened
    }

    val tWrite = System.currentTimeMillis()
    try {
      writeChunks(session, raw)
    } catch (e: Exception) {
      closeLive()
      throw e
    }
    val writeMs = System.currentTimeMillis() - tWrite

    live = session.copy(openedAt = System.currentTimeMillis())
    rememberLast(vendorId, productId)
    Log.i(
      TAG,
      "SEND COMPLETE · $printerName · bytes=${raw.size} · reuse=$reused · " +
        "connect_ms=$connectMs write_ms=$writeMs",
    )
    return SendTiming(connectMs = connectMs, writeMs = writeMs, reused = reused)
  }

  private fun ensureSession(
    printerName: String,
    vendorId: Int,
    productId: Int,
  ): LiveSession {
    closeLive()
    val device = findDeviceWithRetry(vendorId, productId)
      ?: throw IOException(
        "Imprimante USB non branchée (${hexId(vendorId, productId)}) · $printerName",
      )
    ensurePermission(device)
    val connection = usbManager.openDevice(device)
      ?: throw IOException("Impossible d'ouvrir le périphérique USB · $printerName")
    val iface = findPrinterInterface(device)
      ?: run {
        connection.close()
        throw IOException("Aucune interface bulk OUT · $printerName")
      }
    val endpoint = findBulkOutEndpoint(iface)
      ?: run {
        connection.close()
        throw IOException("Endpoint bulk OUT introuvable · $printerName")
      }
    if (!connection.claimInterface(iface, true)) {
      connection.close()
      throw IOException("claimInterface échoué · $printerName")
    }
    val session = LiveSession(
      vendorId = vendorId,
      productId = productId,
      device = device,
      connection = connection,
      usbInterface = iface,
      endpoint = endpoint,
      openedAt = System.currentTimeMillis(),
    )
    live = session
    rememberLast(vendorId, productId)
    PrinterLinkStatusHub.onUsbSessionOpened(vendorId, productId)
    Log.i(TAG, "CONNECTED · $printerName · ${hexId(vendorId, productId)}")
    return session
  }

  private fun writeChunks(session: LiveSession, raw: ByteArray) {
    var offset = 0
    while (offset < raw.size) {
      val len = minOf(CHUNK_SIZE, raw.size - offset)
      val chunk = if (offset == 0 && len == raw.size) {
        raw
      } else {
        raw.copyOfRange(offset, offset + len)
      }
      val written = session.connection.bulkTransfer(
        session.endpoint,
        chunk,
        chunk.size,
        TRANSFER_TIMEOUT_MS,
      )
      if (written < 0) {
        throw IOException("bulkTransfer failed (code=$written)")
      }
      if (written != chunk.size) {
        throw IOException("bulkTransfer court: $written / ${chunk.size}")
      }
      offset += len
      if (offset < raw.size && CHUNK_GAP_MS > 0) {
        Thread.sleep(CHUNK_GAP_MS)
      }
    }
  }

  private fun findDeviceWithRetry(vendorId: Int, productId: Int): UsbDevice? {
    repeat(ENUM_RETRY_COUNT) { i ->
      val found = findDevice(vendorId, productId)
      if (found != null) return found
      if (i < ENUM_RETRY_COUNT - 1) {
        Thread.sleep(ENUM_RETRY_GAP_MS)
      }
    }
    return null
  }

  private fun findDevice(vendorId: Int, productId: Int): UsbDevice? {
    return usbManager.deviceList.values.firstOrNull {
      it.vendorId == vendorId && it.productId == productId
    }
  }

  private fun isSessionAlive(session: LiveSession): Boolean {
    val current = findDevice(session.vendorId, session.productId) ?: return false
    if (current.deviceName != session.device.deviceName) return false
    return usbManager.hasPermission(current)
  }

  private fun matchesSession(session: LiveSession, device: UsbDevice): Boolean {
    return session.device.deviceName == device.deviceName ||
      (session.vendorId == device.vendorId && session.productId == device.productId)
  }

  private fun looksLikePrinter(device: UsbDevice): Boolean {
    for (i in 0 until device.interfaceCount) {
      val iface = device.getInterface(i)
      if (iface.interfaceClass == UsbConstants.USB_CLASS_PRINTER) return true
      if (findBulkOutEndpoint(iface) != null) return true
    }
    return false
  }

  private fun isLastKnown(vendorId: Int, productId: Int): Boolean {
    if (!prefs.contains(KEY_LAST_VID) || !prefs.contains(KEY_LAST_PID)) return false
    return prefs.getInt(KEY_LAST_VID, -1) == vendorId &&
      prefs.getInt(KEY_LAST_PID, -1) == productId
  }

  private fun rememberLast(vendorId: Int, productId: Int) {
    prefs.edit()
      .putInt(KEY_LAST_VID, vendorId)
      .putInt(KEY_LAST_PID, productId)
      .apply()
  }

  private fun findPrinterInterface(device: UsbDevice): UsbInterface? {
    var fallback: UsbInterface? = null
    for (i in 0 until device.interfaceCount) {
      val iface = device.getInterface(i)
      if (findBulkOutEndpoint(iface) == null) continue
      if (iface.interfaceClass == UsbConstants.USB_CLASS_PRINTER) {
        return iface
      }
      if (fallback == null) fallback = iface
    }
    return fallback
  }

  private fun findBulkOutEndpoint(iface: UsbInterface): UsbEndpoint? {
    for (e in 0 until iface.endpointCount) {
      val ep = iface.getEndpoint(e)
      if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK &&
        ep.direction == UsbConstants.USB_DIR_OUT
      ) {
        return ep
      }
    }
    return null
  }

  private fun ensurePermission(device: UsbDevice) {
    if (usbManager.hasPermission(device)) return

    val result = AtomicReference<Boolean?>(null)
    val latch = CountDownLatch(1)
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != ACTION_USB_PERMISSION) return
        val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
        result.set(granted)
        latch.countDown()
      }
    }

    val filter = IntentFilter(ACTION_USB_PERMISSION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      appContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      appContext.registerReceiver(receiver, filter)
    }

    try {
      var flags = PendingIntent.FLAG_UPDATE_CURRENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags = flags or PendingIntent.FLAG_IMMUTABLE
      }
      val pi = PendingIntent.getBroadcast(
        appContext,
        device.deviceId,
        Intent(ACTION_USB_PERMISSION).setPackage(appContext.packageName),
        flags,
      )
      Log.i(TAG, "requestPermission · ${hexId(device.vendorId, device.productId)}")
      usbManager.requestPermission(device, pi)
      if (!latch.await(PERMISSION_WAIT_MS, TimeUnit.MILLISECONDS)) {
        throw IOException("Permission USB expirée — acceptez la boîte de dialogue")
      }
      if (result.get() != true) {
        throw IOException("Permission USB refusée")
      }
    } finally {
      try {
        appContext.unregisterReceiver(receiver)
      } catch (_: Exception) {
        /* ignore */
      }
    }
  }

  private fun closeLive() {
    val session = live
    live = null
    if (session == null) return
    try {
      session.connection.releaseInterface(session.usbInterface)
    } catch (_: Exception) {
      /* ignore */
    }
    try {
      session.connection.close()
    } catch (_: Exception) {
      /* ignore */
    }
    PrinterLinkStatusHub.onUsbSessionClosed()
  }

  private fun hexId(vendorId: Int, productId: Int): String =
    String.format("%04X:%04X", vendorId, productId)
}
