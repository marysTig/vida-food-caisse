package com.marystig.vidafoodcaisse.print

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.util.Base64
import android.util.Log
import java.io.IOException
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

/**
 * Classic SPP (RFCOMM) ESC/POS sender with same-MAC session keep-alive.
 * At most one live socket (single radio). Tuned for 2-printer hubs.
 */
class EscPosBluetoothPrinter {
  companion object {
    private const val TAG = "EscPosBt"
    private val SPP_UUID: UUID =
      UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    /** 2-printer profile — keep in sync with JS bluetoothRadio / kitchenPrintQueue. */
    const val OP_TIMEOUT_MS = 15_000L
    const val HARD_SETTLE_MS = 700L
    const val PRE_DISCONNECT_DRAIN_MS = 175L
    const val INTER_PRINTER_GAP_MS = 700L
    const val RECEIPT_MAC_COOLDOWN_MS = 350L
    /** Keep RFCOMM open for same-MAC burst reuse. */
    const val KEEPALIVE_MS = 20_000L
  }

  data class SendTiming(
    val gapMs: Long,
    val settleMs: Long,
    val connectMs: Long,
    val writeMs: Long,
    val reused: Boolean,
  )

  private val socketRef = AtomicReference<BluetoothSocket?>(null)
  @Volatile private var liveMac: String? = null
  @Volatile private var lastSuccessMac: String? = null
  @Volatile private var liveOpenedAt = 0L
  @Volatile private var radioNeedsSettle = false
  @Volatile private var midWrite = false

  fun isRadioDirty(): Boolean = radioNeedsSettle

  fun wasMidWrite(): Boolean = midWrite

  fun forceClose(reason: String) {
    Log.i(TAG, "forceClose · $reason")
    radioNeedsSettle = true
    midWrite = false
    closeLiveSocket()
  }

  fun hardSettle(reason: String) {
    forceClose(reason)
    Log.i(TAG, "settle ${HARD_SETTLE_MS}ms · $reason")
    Thread.sleep(HARD_SETTLE_MS)
    radioNeedsSettle = false
  }

  /** Close keep-alive session if idle past KEEPALIVE_MS. */
  fun closeIfKeepaliveExpired() {
    val mac = liveMac ?: return
    val age = System.currentTimeMillis() - liveOpenedAt
    if (age >= KEEPALIVE_MS) {
      Log.i(TAG, "keepalive expired · $mac · ${age}ms")
      closeLiveSocket()
      // Clean idle close — do not force settle on next same-MAC connect.
      radioNeedsSettle = false
    }
  }

  private fun closeLiveSocket() {
    liveMac = null
    liveOpenedAt = 0L
    try {
      socketRef.getAndSet(null)?.close()
    } catch (_: Exception) {
      /* ignore */
    }
  }

  private fun normalizeMac(mac: String): String =
    mac.trim().uppercase().replace('-', ':')

  private fun applyMacCooldown(nextMac: String, isReceipt: Boolean): Long {
    val prev = lastSuccessMac?.let { normalizeMac(it) }
    val next = normalizeMac(nextMac)
    if (prev.isNullOrBlank() || prev == next) return 0L
    val gap = if (isReceipt) RECEIPT_MAC_COOLDOWN_MS else INTER_PRINTER_GAP_MS
    Log.i(TAG, "MAC cooldown ${gap}ms · $prev → $next")
    Thread.sleep(gap)
    return gap
  }

  /**
   * Write ESC/POS bytes. Reuses live socket when same MAC within keepalive.
   */
  @SuppressLint("MissingPermission")
  fun sendEscPos(
    printerName: String,
    macAddress: String,
    dataBase64: String,
    isReceipt: Boolean,
  ): SendTiming {
    val mac = normalizeMac(macAddress)
    if (mac.isBlank()) throw IOException("Adresse MAC manquante")

    val adapter = BluetoothAdapter.getDefaultAdapter()
      ?: throw IOException("Bluetooth non disponible")
    if (!adapter.isEnabled) {
      throw IOException("Le Bluetooth est désactivé sur la tablette !")
    }

    val raw = Base64.decode(dataBase64, Base64.DEFAULT)
    if (raw.isEmpty()) throw IOException("Payload ESC/POS vide")

    var gapMs = 0L
    var settleMs = 0L
    var connectMs = 0L
    var reused = false

    val existing = socketRef.get()
    val canReuse =
      existing != null &&
        existing.isConnected &&
        liveMac == mac &&
        (System.currentTimeMillis() - liveOpenedAt) < KEEPALIVE_MS &&
        !radioNeedsSettle

    val socket: BluetoothSocket
    if (canReuse) {
      reused = true
      socket = existing!!
      Log.i(TAG, "REUSE · $printerName · $mac")
    } else {
      if (existing != null || liveMac != null) {
        closeLiveSocket()
      }
      gapMs = applyMacCooldown(mac, isReceipt)
      if (radioNeedsSettle) {
        val tSettle = System.currentTimeMillis()
        hardSettle("pre-connect:$printerName")
        settleMs = System.currentTimeMillis() - tSettle
      } else if (lastSuccessMac != null && normalizeMac(lastSuccessMac!!) != mac) {
        Thread.sleep(100)
      }

      val device: BluetoothDevice = try {
        resolveBondedDevice(adapter, mac)
      } catch (e: IllegalArgumentException) {
        throw IOException("MAC invalide: $mac", e)
      }

      Log.i(TAG, "CONNECT START · $printerName · $mac")
      val tConnect = System.currentTimeMillis()
      socket = connectEscPos(device, printerName)
      connectMs = System.currentTimeMillis() - tConnect
      socketRef.set(socket)
      liveMac = mac
      liveOpenedAt = System.currentTimeMillis()
      Log.i(TAG, "CONNECTED · $printerName · connect_ms=$connectMs")
    }

    val tWrite = System.currentTimeMillis()
    midWrite = true
    try {
      val out = socket.outputStream
      out.write(raw)
      out.flush()
      if (!isReceipt) {
        Thread.sleep(PRE_DISCONNECT_DRAIN_MS)
      }
    } catch (e: Exception) {
      midWrite = false
      forceClose("write-fail:$printerName")
      throw e
    }
    midWrite = false

    val writeMs = System.currentTimeMillis() - tWrite
    lastSuccessMac = mac
    liveMac = mac
    liveOpenedAt = System.currentTimeMillis()
    radioNeedsSettle = false
    Log.i(
      TAG,
      "SEND COMPLETE · $printerName · bytes=${raw.size} · reuse=$reused · " +
        "gap_ms=$gapMs settle_ms=$settleMs connect_ms=$connectMs write_ms=$writeMs",
    )
    return SendTiming(gapMs, settleMs, connectMs, writeMs, reused)
  }

  /** Reachability probe — one settle, closes session afterward. */
  @SuppressLint("MissingPermission")
  fun probeConnect(printerName: String, macAddress: String) {
    val mac = normalizeMac(macAddress)
    val adapter = BluetoothAdapter.getDefaultAdapter()
      ?: throw IOException("Bluetooth non disponible")
    if (!adapter.isEnabled) {
      throw IOException("Bluetooth désactivé")
    }
    applyMacCooldown(mac, isReceipt = false)
    hardSettle("probe:$printerName")
    val device = resolveBondedDevice(adapter, mac)
    val socket = connectEscPos(device, printerName)
    socketRef.set(socket)
    liveMac = mac
    try {
      lastSuccessMac = mac
      radioNeedsSettle = false
    } finally {
      closeLiveSocket()
      // Leave dirty so next production connect settles once if needed soon after.
      radioNeedsSettle = true
    }
  }

  @SuppressLint("MissingPermission")
  private fun resolveBondedDevice(adapter: BluetoothAdapter, mac: String): BluetoothDevice {
    val bonded = adapter.bondedDevices?.firstOrNull { it.address.equals(mac, ignoreCase = true) }
    return bonded ?: adapter.getRemoteDevice(mac)
  }

  /** Insecure SPP UUID then insecure channel-1 — same as cordova bluetooth-serial. */
  @SuppressLint("MissingPermission")
  private fun connectEscPos(device: BluetoothDevice, printerName: String): BluetoothSocket {
    val adapter = BluetoothAdapter.getDefaultAdapter()
    try {
      adapter?.cancelDiscovery()
    } catch (_: Exception) {
      /* ignore */
    }

    val primary =
      try {
        device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)
      } catch (_: Exception) {
        device.createRfcommSocketToServiceRecord(SPP_UUID)
      }
    socketRef.set(primary)
    try {
      connectWithTimeout(primary, OP_TIMEOUT_MS)
      return primary
    } catch (first: IOException) {
      Log.w(TAG, "SPP UUID failed · $printerName — trying channel 1", first)
      try {
        primary.close()
      } catch (_: Exception) {
        /* ignore */
      }
      socketRef.compareAndSet(primary, null)
    }

    val fallback =
      try {
        device.javaClass
          .getMethod("createInsecureRfcommSocket", Int::class.javaPrimitiveType)
          .invoke(device, 1) as BluetoothSocket
      } catch (_: Exception) {
        device.javaClass
          .getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          .invoke(device, 1) as BluetoothSocket
      }
    socketRef.set(fallback)
    try {
      connectWithTimeout(fallback, OP_TIMEOUT_MS)
      Log.i(TAG, "CONNECTED channel1 · $printerName")
      return fallback
    } catch (second: IOException) {
      try {
        fallback.close()
      } catch (_: Exception) {
        /* ignore */
      }
      socketRef.compareAndSet(fallback, null)
      throw second
    }
  }

  @SuppressLint("MissingPermission")
  private fun connectWithTimeout(socket: BluetoothSocket, timeoutMs: Long) {
    val err = AtomicReference<Exception?>(null)
    val t = Thread({
      try {
        socket.connect()
      } catch (e: Exception) {
        err.set(e)
      }
    }, "EscPosConnect")
    t.isDaemon = true
    t.start()
    t.join(timeoutMs)
    if (t.isAlive) {
      try {
        socket.close()
      } catch (_: Exception) {
        /* ignore */
      }
      t.interrupt()
      try {
        t.join(1_000)
      } catch (_: Exception) {
        /* ignore */
      }
      throw IOException(
        "Délai d'attente dépassé pour la connexion (${timeoutMs / 1000}s)",
      )
    }
    err.get()?.let { e ->
      throw IOException(
        "Connexion impossible (Vérifiez l'imprimante): ${e.message}",
        e,
      )
    }
    if (!socket.isConnected) {
      throw IOException("Connexion impossible — socket non connecté")
    }
  }
}
