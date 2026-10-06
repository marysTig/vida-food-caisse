package com.marystig.vidafoodcaisse.print

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.util.Base64
import android.util.Log
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

/**
 * Classic SPP (RFCOMM) ESC/POS sender with same-MAC session keep-alive.
 * Prefers last-known connect mode per MAC; caps SPP attempts so a dead UUID
 * path cannot burn 15s on the radio thread (Logcat 17:50 evidence).
 */
class EscPosBluetoothPrinter {
  companion object {
    private const val TAG = "EscPosBt"
    private val SPP_UUID: UUID =
      UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    const val OP_TIMEOUT_MS = 15_000L
    /** Fast-fail SPP UUID — Logcat showed long stalls before fallback. */
    const val SPP_ATTEMPT_MS = 3_000L
    /** Cuisin likes channel-1 (~0.5s); Caisse often needs clean radio — don't burn 6s. */
    const val CHANNEL1_ATTEMPT_MS = 3_500L
    const val PROBE_ATTEMPT_MS = 2_500L
    /** Pause after a failed connect mode before trying the other (dirty ACL). */
    const val INTER_MODE_SETTLE_MS = 450L
    /** Extra settle when closing a keep-alive session to switch MAC. */
    const val MAC_SWITCH_SETTLE_MS = 500L
    const val HARD_SETTLE_MS = 700L
    const val PRE_DISCONNECT_DRAIN_MS = 175L
    const val INTER_PRINTER_GAP_MS = 900L
    const val RECEIPT_MAC_COOLDOWN_MS = 350L
    const val KEEPALIVE_MS = 20_000L
  }

  private enum class ConnectMode { CHANNEL1, SPP }

  data class SendTiming(
    val gapMs: Long,
    val settleMs: Long,
    val connectMs: Long,
    val writeMs: Long,
    val reused: Boolean,
  )

  private val socketRef = AtomicReference<BluetoothSocket?>(null)
  private val preferredMode = ConcurrentHashMap<String, ConnectMode>()
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

  fun closeIfKeepaliveExpired() {
    val mac = liveMac ?: return
    val age = System.currentTimeMillis() - liveOpenedAt
    if (age >= KEEPALIVE_MS) {
      Log.i(TAG, "keepalive expired · $mac · ${age}ms")
      closeLiveSocket()
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
      val hadLive = existing != null || liveMac != null
      val switchingMac =
        hadLive && liveMac != null && liveMac != mac
      if (hadLive) {
        closeLiveSocket()
      }
      gapMs = applyMacCooldown(mac, isReceipt)
      if (radioNeedsSettle) {
        val tSettle = System.currentTimeMillis()
        hardSettle("pre-connect:$printerName")
        settleMs = System.currentTimeMillis() - tSettle
      } else if (switchingMac) {
        // Keep-alive close leaves ACL dirty — Logcat: Caisse CHANNEL1 6s fail after Cuisin.
        Log.i(TAG, "MAC switch settle ${MAC_SWITCH_SETTLE_MS}ms · $printerName")
        Thread.sleep(MAC_SWITCH_SETTLE_MS)
        settleMs = MAC_SWITCH_SETTLE_MS
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
      socket = connectEscPos(device, printerName, mac, probe = false)
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

  /** Reachability probe — short timeouts; does not burn 15s SPP. */
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
    val socket = connectEscPos(device, printerName, mac, probe = true)
    socketRef.set(socket)
    liveMac = mac
    try {
      lastSuccessMac = mac
      radioNeedsSettle = false
    } finally {
      closeLiveSocket()
      radioNeedsSettle = true
    }
  }

  @SuppressLint("MissingPermission")
  private fun resolveBondedDevice(adapter: BluetoothAdapter, mac: String): BluetoothDevice {
    val bonded = adapter.bondedDevices?.firstOrNull { it.address.equals(mac, ignoreCase = true) }
    return bonded ?: adapter.getRemoteDevice(mac)
  }

  /**
   * Prefer last successful mode per MAC; default CHANNEL1 (Cuisin ~0.5s).
   * After a failed mode, settle briefly before the other — Logcat showed instant
   * SPP "read ret: -1" when tried immediately after CHANNEL1 timeout.
   */
  @SuppressLint("MissingPermission")
  private fun connectEscPos(
    device: BluetoothDevice,
    printerName: String,
    mac: String,
    probe: Boolean,
  ): BluetoothSocket {
    val adapter = BluetoothAdapter.getDefaultAdapter()
    try {
      adapter?.cancelDiscovery()
    } catch (_: Exception) {
      /* ignore */
    }

    val sppMs = if (probe) PROBE_ATTEMPT_MS else SPP_ATTEMPT_MS
    val ch1Ms = if (probe) PROBE_ATTEMPT_MS else CHANNEL1_ATTEMPT_MS
    val first = preferredMode[mac] ?: ConnectMode.CHANNEL1
    val second = if (first == ConnectMode.CHANNEL1) ConnectMode.SPP else ConnectMode.CHANNEL1

    try {
      val s = openMode(device, first, if (first == ConnectMode.SPP) sppMs else ch1Ms)
      preferredMode[mac] = first
      Log.i(TAG, "CONNECTED ${first.name} · $printerName")
      return s
    } catch (firstErr: IOException) {
      Log.w(TAG, "${first.name} failed · $printerName — settle then ${second.name}", firstErr)
      try {
        socketRef.getAndSet(null)?.close()
      } catch (_: Exception) {
        /* ignore */
      }
      Thread.sleep(INTER_MODE_SETTLE_MS)
    }

    val s = openMode(device, second, if (second == ConnectMode.SPP) sppMs else ch1Ms)
    preferredMode[mac] = second
    Log.i(TAG, "CONNECTED ${second.name} · $printerName")
    return s
  }

  @SuppressLint("MissingPermission")
  private fun openMode(device: BluetoothDevice, mode: ConnectMode, timeoutMs: Long): BluetoothSocket {
    val socket = when (mode) {
      ConnectMode.SPP ->
        try {
          device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)
        } catch (_: Exception) {
          device.createRfcommSocketToServiceRecord(SPP_UUID)
        }
      ConnectMode.CHANNEL1 ->
        try {
          device.javaClass
            .getMethod("createInsecureRfcommSocket", Int::class.javaPrimitiveType)
            .invoke(device, 1) as BluetoothSocket
        } catch (_: Exception) {
          device.javaClass
            .getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
            .invoke(device, 1) as BluetoothSocket
        }
    }
    socketRef.set(socket)
    try {
      connectWithTimeout(socket, timeoutMs)
      return socket
    } catch (e: IOException) {
      try {
        socket.close()
      } catch (_: Exception) {
        /* ignore */
      }
      socketRef.compareAndSet(socket, null)
      throw e
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
