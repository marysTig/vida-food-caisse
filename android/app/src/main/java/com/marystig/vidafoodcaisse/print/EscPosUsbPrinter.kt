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
 */
class EscPosUsbPrinter(private val appContext: Context) {
  companion object {
    private const val TAG = "EscPosUsb"
    private const val ACTION_USB_PERMISSION =
      "com.marystig.vidafoodcaisse.USB_PERMISSION"
    const val TRANSFER_TIMEOUT_MS = 5_000
    const val CHUNK_SIZE = 16_384
    const val CHUNK_GAP_MS = 5L
    const val KEEPALIVE_MS = 60_000L
    const val PERMISSION_WAIT_MS = 45_000L
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
    val session = live ?: return
    if (session.device.deviceName == device.deviceName ||
      (session.vendorId == device.vendorId && session.productId == device.productId)
    ) {
      Log.w(TAG, "USB detached · ${hexId(session.vendorId, session.productId)}")
      closeLive()
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

    var reused = false
    var connectMs = 0L
    val existing = live
    val session = if (
      existing != null &&
      existing.vendorId == vendorId &&
      existing.productId == productId &&
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

    // Refresh keep-alive clock
    live = session.copy(openedAt = System.currentTimeMillis())
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
    val device = findDevice(vendorId, productId)
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

  private fun findDevice(vendorId: Int, productId: Int): UsbDevice? {
    return usbManager.deviceList.values.firstOrNull {
      it.vendorId == vendorId && it.productId == productId
    }
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
  }

  private fun hexId(vendorId: Int, productId: Int): String =
    String.format("%04X:%04X", vendorId, productId)
}
