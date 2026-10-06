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
 * Default connect mode is SPP — CHANNEL1 first burns ~5s and dirties ACL so the
 * SPP fallback often fails (Logcat 20:40 Plaque/Four evidence).
 */
class EscPosBluetoothPrinter(
  private val appContext: android.content.Context? = null,
) {
  companion object {
    private const val TAG = "EscPosBt"
    private const val PREFS = "escpos_bt_modes"
    private val SPP_UUID: UUID =
      UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    const val OP_TIMEOUT_MS = 15_000L
    /** Primary path for kitchen ESC/POS. */
    const val SPP_ATTEMPT_MS = 4_000L
    /** Fallback only — keep short so a dead channel-1 cannot burn the radio. */
    const val CHANNEL1_ATTEMPT_MS = 2_000L
    const val PROBE_ATTEMPT_MS = 2_500L
    /** After CHANNEL1 timeout the ACL is dirty — needs longer than 450ms (Logcat read ret -1). */
    const val INTER_MODE_SETTLE_MS = 900L
    /**
     * Kitchen↔kitchen MAC handoff settle. Logcat 21:20 Four: settle=0 still
     * connected in 1267ms after gap alone — skip artificial settle when radio clean.
     */
    const val MAC_SWITCH_SETTLE_MS = 0L
    const val HARD_SETTLE_MS = 700L
    const val PRE_DISCONNECT_DRAIN_MS = 100L
    /**
     * Inter-kitchen gap on one radio. Was 400; second ticket waited gap+connect
     * (~1.7s) after first. Keep a tiny ACL tear-down window only.
     */
    const val INTER_PRINTER_GAP_MS = 100L
    const val RECEIPT_MAC_COOLDOWN_MS = 200L
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

  init {
    loadPreferredModes()
  }

  fun isRadioDirty(): Boolean = radioNeedsSettle

  fun wasMidWrite(): Boolean = midWrite

  fun forceClose(reason: String) {
    Log.i(TAG, "forceClose · $reason")
    radioNeedsSettle = true
    midWrite = false
    closeLiveSocket()
  }

  fun liveMacOrNull(): String? = liveMac

  fun lastSuccessMacOrNull(): String? = lastSuccessMac

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
    val prev = liveMac
    liveMac = null
    liveOpenedAt = 0L
    try {
      socketRef.getAndSet(null)?.close()
    } catch (_: Exception) {
      /* ignore */
    }
    PrinterLinkStatusHub.onBtSessionClosed(prev)
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
    /** True when another BT kitchen job is already queued — release ACL ASAP. */
    releaseForHandoff: Boolean = false,
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
      if (switchingMac || hadLive) {
        PrinterLinkStatusHub.markIntentionalRadioSwitch()
      }
      if (hadLive) {
        closeLiveSocket()
      }
      gapMs = applyMacCooldown(mac, isReceipt)
      if (radioNeedsSettle) {
        val tSettle = System.currentTimeMillis()
        hardSettle("pre-connect:$printerName")
        settleMs = System.currentTimeMillis() - tSettle
      } else if (switchingMac && MAC_SWITCH_SETTLE_MS > 0L) {
        Log.i(TAG, "MAC switch settle ${MAC_SWITCH_SETTLE_MS}ms · $printerName")
        Thread.sleep(MAC_SWITCH_SETTLE_MS)
        settleMs = MAC_SWITCH_SETTLE_MS
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
      PrinterLinkStatusHub.onBtSessionOpened(mac)
      Log.i(TAG, "CONNECTED · $printerName · connect_ms=$connectMs")
    }

    val tWrite = System.currentTimeMillis()
    midWrite = true
    try {
      val out = socket.outputStream
      out.write(raw)
      out.flush()
      // Skip drain when handing off — next MAC connect needs the radio free now.
      if (!isReceipt && !releaseForHandoff) {
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
    PrinterLinkStatusHub.onBtSuccess(mac)

    // Drop keepalive early so ACL tear-down overlaps the next job's gap/connect.
    if (releaseForHandoff && !isReceipt) {
      Log.i(TAG, "handoff release · $printerName · $mac")
      closeLiveSocket()
      radioNeedsSettle = false
    }

    // #region agent log
    Log.i(
      "PrinterLinkDebug",
      """{"sessionId":"5eee2c","hypothesisId":"E","runId":"post-fix-handoff","location":"EscPosBt.sendEscPos","message":"send-complete","data":{"printer":"$printerName","gapMs":$gapMs,"settleMs":$settleMs,"connectMs":$connectMs,"writeMs":$writeMs,"reused":$reused,"releaseForHandoff":$releaseForHandoff},"timestamp":${System.currentTimeMillis()}}""",
    )
    // #endregion
    Log.i(
      TAG,
      "SEND COMPLETE · $printerName · bytes=${raw.size} · reuse=$reused · " +
        "gap_ms=$gapMs settle_ms=$settleMs connect_ms=$connectMs write_ms=$writeMs" +
        if (releaseForHandoff) " · handoff" else "",
    )
    return SendTiming(gapMs, settleMs, connectMs, writeMs, reused)
  }

  /** Reachability probe — soft when radio is clean to avoid stealing the other kitchen LED / traffic. */
  @SuppressLint("MissingPermission")
  fun probeConnect(printerName: String, macAddress: String) {
    val mac = normalizeMac(macAddress)
    val adapter = BluetoothAdapter.getDefaultAdapter()
      ?: throw IOException("Bluetooth non disponible")
    if (!adapter.isEnabled) {
      throw IOException("Bluetooth désactivé")
    }
    PrinterLinkStatusHub.markIntentionalRadioSwitch()
    val hadLive = socketRef.get() != null || liveMac != null
    if (hadLive && liveMac != mac) {
      applyMacCooldown(mac, isReceipt = false)
    }
    if (radioNeedsSettle || hadLive) {
      hardSettle("probe:$printerName")
    } else {
      // Soft status probe — no hard settle when radio is idle (cuts LED-check latency).
      Thread.sleep(120L)
    }
    val device = resolveBondedDevice(adapter, mac)
    val socket = connectEscPos(device, printerName, mac, probe = true)
    socketRef.set(socket)
    liveMac = mac
    PrinterLinkStatusHub.onBtSessionOpened(mac)
    try {
      lastSuccessMac = mac
      radioNeedsSettle = false
      PrinterLinkStatusHub.onBtSuccess(mac)
    } finally {
      closeLiveSocket()
      // Soft probe: leave radio usable for production without forcing dirty flag.
      radioNeedsSettle = hadLive || radioNeedsSettle
    }
  }

  @SuppressLint("MissingPermission")
  private fun resolveBondedDevice(adapter: BluetoothAdapter, mac: String): BluetoothDevice {
    val bonded = adapter.bondedDevices?.firstOrNull { it.address.equals(mac, ignoreCase = true) }
    return bonded ?: adapter.getRemoteDevice(mac)
  }

  /**
   * Prefer last successful mode per MAC; default SPP (Logcat 20:40: CHANNEL1-first
   * timed out then SPP failed on dirty ACL — jobs failed while LED stayed green).
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
    val ch1Ms = if (probe) minOf(PROBE_ATTEMPT_MS, CHANNEL1_ATTEMPT_MS) else CHANNEL1_ATTEMPT_MS
    val first = preferredMode[mac] ?: ConnectMode.SPP
    val second = if (first == ConnectMode.SPP) ConnectMode.CHANNEL1 else ConnectMode.SPP

    // #region agent log
    Log.i(
      "PrinterLinkDebug",
      """{"sessionId":"5eee2c","hypothesisId":"A","runId":"post-fix","location":"EscPosBt.connectEscPos","message":"connect-order","data":{"printer":"$printerName","mac":"$mac","first":"${first.name}","second":"${second.name}","probe":$probe},"timestamp":${System.currentTimeMillis()}}""",
    )
    // #endregion

    try {
      val s = openMode(device, first, if (first == ConnectMode.SPP) sppMs else ch1Ms)
      preferredMode[mac] = first
      persistPreferredMode(mac, first)
      Log.i(TAG, "CONNECTED ${first.name} · $printerName")
      return s
    } catch (firstErr: IOException) {
      Log.w(TAG, "${first.name} failed · $printerName — settle then ${second.name}", firstErr)
      // #region agent log
      Log.i(
        "PrinterLinkDebug",
        """{"sessionId":"5eee2c","hypothesisId":"A","runId":"post-fix","location":"EscPosBt.connectEscPos","message":"first-mode-failed","data":{"printer":"$printerName","mode":"${first.name}","err":"${firstErr.message?.replace("\"","'")}","next":"${second.name}"},"timestamp":${System.currentTimeMillis()}}""",
      )
      // #endregion
      try {
        socketRef.getAndSet(null)?.close()
      } catch (_: Exception) {
        /* ignore */
      }
      val settle =
        if (first == ConnectMode.CHANNEL1) maxOf(INTER_MODE_SETTLE_MS, HARD_SETTLE_MS)
        else INTER_MODE_SETTLE_MS
      Thread.sleep(settle)
    }

    val s = openMode(device, second, if (second == ConnectMode.SPP) sppMs else ch1Ms)
    preferredMode[mac] = second
    persistPreferredMode(mac, second)
    Log.i(TAG, "CONNECTED ${second.name} · $printerName")
    return s
  }

  private fun loadPreferredModes() {
    val ctx = appContext ?: return
    try {
      val prefs = ctx.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
      for ((k, v) in prefs.all) {
        val mode = when (v?.toString()?.uppercase()) {
          "SPP" -> ConnectMode.SPP
          "CHANNEL1" -> ConnectMode.CHANNEL1
          else -> null
        }
        if (mode != null && k.isNotBlank()) {
          preferredMode[normalizeMac(k)] = mode
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "loadPreferredModes: ${e.message}")
    }
  }

  private fun persistPreferredMode(mac: String, mode: ConnectMode) {
    val ctx = appContext ?: return
    try {
      ctx.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
        .edit()
        .putString(mac, mode.name)
        .apply()
    } catch (_: Exception) {
      /* ignore */
    }
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
