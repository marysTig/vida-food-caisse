package com.marystig.vidafoodcaisse.print

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.util.Base64
import android.util.Log
import java.io.IOException
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Classic SPP (RFCOMM) ESC/POS sender with same-MAC session keep-alive.
 * Default connect mode is SPP — CHANNEL1 first burns ~5s and dirties ACL so the
 * SPP fallback often fails (Logcat 20:40 Plaque/Four evidence).
 */
class EscPosBluetoothPrinter(
  private val appContext: android.content.Context? = null,
  /**
   * Parallel-lane mode: keep the RFCOMM session open indefinitely for printers
   * that answer DLE EOT (liveness is pinged by the lane). Printers without status
   * replies keep the 20s keepalive — a dead link cannot be detected on them.
   */
  private val persistent: Boolean = false,
) {
  companion object {
    private const val TAG = "EscPosBt"
    private const val PREFS = "escpos_bt_modes"
    private val SPP_UUID: UUID =
      UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    /**
     * Write deadline: base + 1ms per 4 bytes (≈4 KB/s worst-case SPP), capped.
     * On expiry the socket is closed, which unblocks a stuck write().
     */
    const val WRITE_TIMEOUT_BASE_MS = 8_000L
    const val WRITE_TIMEOUT_MAX_MS = 20_000L
    /** DLE EOT 1 (real-time printer status) — reply proves all prior bytes reached the printer. */
    private val DLE_EOT_PRINTER = byteArrayOf(0x10, 0x04, 0x01)
    const val STATUS_BASE_MS = 1_200L
    const val STATUS_MAX_MS = 4_000L
    const val STATUS_POLL_MS = 20L
    /** Liveness ping before reusing a kept-alive socket (status-capable printers only). */
    const val LIVENESS_TIMEOUT_MS = 800L
    /** Consecutive silent replies before a printer is treated as not status-capable. */
    const val STATUS_LEARN_ATTEMPTS = 3
    /**
     * Fallback pre-close drain for printers without status replies:
     * base + 1ms per 16 bytes, capped. Closing RFCOMM right after write() can drop
     * bytes still queued in the BT stack (truncated / missing kitchen tickets).
     */
    const val DRAIN_BASE_MS = 150L
    const val DRAIN_BYTES_PER_MS = 16
    const val DRAIN_MAX_MS = 2_000L
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
    /**
     * Inter-kitchen gap on one radio. Was 400; second ticket waited gap+connect
     * (~1.7s) after first. Keep a tiny ACL tear-down window only.
     */
    const val INTER_PRINTER_GAP_MS = 100L
    const val RECEIPT_MAC_COOLDOWN_MS = 200L
    const val KEEPALIVE_MS = 20_000L
  }

  private enum class ConnectMode { CHANNEL1, SPP }

  /** Learned per MAC, in memory only (relearned per process / printer swap). */
  private enum class StatusSupport { YES, NO }

  data class SendTiming(
    val gapMs: Long,
    val settleMs: Long,
    val connectMs: Long,
    val writeMs: Long,
    val reused: Boolean,
    /** "status" = printer acknowledged via DLE EOT; "drain" = timed fallback. */
    val confirm: String,
  )

  private val socketRef = AtomicReference<BluetoothSocket?>(null)
  private val preferredMode = ConcurrentHashMap<String, ConnectMode>()
  private val statusSupport = ConcurrentHashMap<String, StatusSupport>()
  private val statusSilentCount = ConcurrentHashMap<String, Int>()
  private val ioWatchdog = Executors.newSingleThreadScheduledExecutor { r ->
    Thread(r, "EscPosBtWatchdog").apply { isDaemon = true }
  }
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

  /** Lane teardown — closes the session and the IO watchdog thread. */
  fun shutdown(reason: String) {
    forceClose(reason)
    ioWatchdog.shutdownNow()
  }

  fun liveMacOrNull(): String? = liveMac

  fun lastSuccessMacOrNull(): String? = lastSuccessMac

  fun hardSettle(reason: String) {
    forceClose(reason)
    Log.i(TAG, "settle ${HARD_SETTLE_MS}ms · $reason")
    Thread.sleep(HARD_SETTLE_MS)
    radioNeedsSettle = false
  }

  private fun holdsPersistently(mac: String): Boolean =
    persistent && statusSupport[mac] == StatusSupport.YES

  fun isStatusCapable(macAddress: String): Boolean =
    statusSupport[normalizeMac(macAddress)] == StatusSupport.YES

  fun isStatusUnsupported(macAddress: String): Boolean =
    statusSupport[normalizeMac(macAddress)] == StatusSupport.NO

  fun hasLiveSession(): Boolean = liveMac != null && socketRef.get()?.isConnected == true

  /** Millis since the live session last proved itself (connect, write or ping). */
  fun liveIdleMs(): Long =
    if (liveOpenedAt == 0L) Long.MAX_VALUE else System.currentTimeMillis() - liveOpenedAt

  fun closeIfKeepaliveExpired() {
    val mac = liveMac ?: return
    if (holdsPersistently(mac)) return
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
        (holdsPersistently(mac) || (System.currentTimeMillis() - liveOpenedAt) < KEEPALIVE_MS) &&
        !radioNeedsSettle

    var reusable: BluetoothSocket? = null
    if (canReuse) {
      // isConnected is local-only — a printer powered off during keepalive still
      // looks connected and write() lands in the local buffer (false "done").
      if (isLinkAlive(existing!!, mac, printerName)) {
        reusable = existing
      } else {
        Log.w(TAG, "REUSE rejected · $printerName · no status reply — reconnect")
        closeLiveSocket()
      }
    }

    val socket: BluetoothSocket
    if (reusable != null) {
      reused = true
      socket = reusable
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
    val confirm = try {
      val writeTimeout =
        (WRITE_TIMEOUT_BASE_MS + raw.size / 4).coerceAtMost(WRITE_TIMEOUT_MAX_MS)
      // Deadline covers write + delivery confirmation (both can block on a dead link).
      withIoDeadline(socket, writeTimeout + STATUS_MAX_MS, "write:$printerName") {
        val out = socket.outputStream
        out.write(raw)
        out.flush()
        // Never ack/close before the printer has the bytes — also on handoff.
        confirmDelivery(socket, mac, printerName, raw.size)
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

    Log.i(
      TAG,
      "SEND COMPLETE · $printerName · bytes=${raw.size} · reuse=$reused · " +
        "gap_ms=$gapMs settle_ms=$settleMs connect_ms=$connectMs write_ms=$writeMs " +
        "confirm=$confirm" +
        if (releaseForHandoff) " · handoff" else "",
    )
    return SendTiming(gapMs, settleMs, connectMs, writeMs, reused, confirm)
  }

  /**
   * Runs [block] with a watchdog that closes [socket] after [timeoutMs].
   * Closing is the only way to unblock a stuck RFCOMM write()/read().
   */
  private fun <T> withIoDeadline(
    socket: BluetoothSocket,
    timeoutMs: Long,
    label: String,
    block: () -> T,
  ): T {
    val fired = AtomicBoolean(false)
    val watchdog = ioWatchdog.schedule({
      fired.set(true)
      Log.e(TAG, "IO deadline ${timeoutMs}ms exceeded · $label — closing socket")
      try {
        socket.close()
      } catch (_: Exception) {
        /* ignore */
      }
    }, timeoutMs, TimeUnit.MILLISECONDS)
    try {
      val result = block()
      if (fired.get()) throw IOException("Délai d'écriture dépassé (${timeoutMs / 1000}s)")
      return result
    } catch (e: IOException) {
      if (fired.get()) {
        throw IOException("Délai d'écriture dépassé (${timeoutMs / 1000}s) — imprimante bloquée", e)
      }
      throw e
    } finally {
      watchdog.cancel(false)
    }
  }

  /**
   * Ensures the printer received every byte before the caller acks or closes.
   * Status-capable printers answer DLE EOT 1 only after the preceding bytes
   * arrived (RFCOMM is ordered). Others get a size-based drain.
   * @return "status" or "drain"
   */
  private fun confirmDelivery(
    socket: BluetoothSocket,
    mac: String,
    printerName: String,
    bytes: Int,
  ): String {
    val support = statusSupport[mac]
    if (support != StatusSupport.NO) {
      val timeout = (STATUS_BASE_MS + bytes / 10).coerceAtMost(STATUS_MAX_MS)
      val replied = requestStatus(socket, timeout)
      if (!replied && support == StatusSupport.YES) {
        // Printer normally answers — silence means the link died mid-ticket.
        throw IOException("Imprimante sans réponse après envoi — ticket non confirmé")
      }
      recordStatusReply(mac, printerName, replied)
      if (replied) return "status"
    }
    val drain = (DRAIN_BASE_MS + bytes / DRAIN_BYTES_PER_MS).coerceAtMost(DRAIN_MAX_MS)
    Thread.sleep(drain)
    return "drain"
  }

  /** Learns status capability: one reply → YES; N consecutive silences → NO. */
  private fun recordStatusReply(mac: String, printerName: String, replied: Boolean) {
    if (replied) {
      if (statusSupport[mac] == null) Log.i(TAG, "status-capable · $printerName")
      statusSupport[mac] = StatusSupport.YES
      statusSilentCount.remove(mac)
      return
    }
    if (statusSupport[mac] != null) return
    val silent = (statusSilentCount[mac] ?: 0) + 1
    statusSilentCount[mac] = silent
    if (silent >= STATUS_LEARN_ATTEMPTS) {
      statusSupport[mac] = StatusSupport.NO
      Log.i(TAG, "no status replies · $printerName — drain-only confirmation")
    }
  }

  /**
   * Lane warm-up / reconnect: make sure a live, verified session to [macAddress]
   * exists (reuse + ping when possible, else connect and learn status support).
   * Throws IOException when the printer cannot be reached.
   */
  @SuppressLint("MissingPermission")
  fun ensureConnected(printerName: String, macAddress: String) {
    val mac = normalizeMac(macAddress)
    val adapter = BluetoothAdapter.getDefaultAdapter()
      ?: throw IOException("Bluetooth non disponible")
    if (!adapter.isEnabled) throw IOException("Bluetooth désactivé")

    val existing = socketRef.get()
    if (existing != null && existing.isConnected && liveMac == mac && !radioNeedsSettle) {
      if (isLinkAlive(existing, mac, printerName)) {
        liveOpenedAt = System.currentTimeMillis()
        PrinterLinkStatusHub.onBtSuccess(mac)
        return
      }
      Log.w(TAG, "ensureConnected · $printerName · stale session — reconnect")
    }
    if (existing != null || liveMac != null) {
      PrinterLinkStatusHub.markIntentionalRadioSwitch()
      closeLiveSocket()
    }
    if (radioNeedsSettle) hardSettle("ensure:$printerName")

    val device = try {
      resolveBondedDevice(adapter, mac)
    } catch (e: IllegalArgumentException) {
      throw IOException("MAC invalide: $mac", e)
    }
    val t0 = System.currentTimeMillis()
    val socket = connectEscPos(device, printerName, mac, probe = false)
    socketRef.set(socket)
    liveMac = mac
    liveOpenedAt = System.currentTimeMillis()
    PrinterLinkStatusHub.onBtSessionOpened(mac)
    if (statusSupport[mac] == null) {
      try {
        val replied = withIoDeadline(socket, STATUS_BASE_MS + 1_000L, "learn:$printerName") {
          requestStatus(socket, STATUS_BASE_MS)
        }
        recordStatusReply(mac, printerName, replied)
      } catch (e: IOException) {
        forceClose("learn-fail:$printerName")
        throw e
      }
    }
    lastSuccessMac = mac
    radioNeedsSettle = false
    PrinterLinkStatusHub.onBtSuccess(mac)
    Log.i(TAG, "SESSION READY · $printerName · connect_ms=${System.currentTimeMillis() - t0}")
  }

  /**
   * Idle liveness ping of the live session.
   * @return null when not applicable (no session / printer without status replies),
   * true when alive, false when dead (session is closed).
   */
  fun pingLive(printerName: String): Boolean? {
    val socket = socketRef.get() ?: return null
    val mac = liveMac ?: return null
    if (statusSupport[mac] != StatusSupport.YES) return null
    if (isLinkAlive(socket, mac, printerName)) {
      liveOpenedAt = System.currentTimeMillis()
      PrinterLinkStatusHub.onBtSuccess(mac)
      return true
    }
    Log.w(TAG, "ping failed · $printerName — session closed")
    forceClose("ping-fail:$printerName")
    return false
  }

  /** Liveness check before reuse; only meaningful for status-capable printers. */
  private fun isLinkAlive(socket: BluetoothSocket, mac: String, printerName: String): Boolean {
    if (statusSupport[mac] != StatusSupport.YES) return true
    return try {
      withIoDeadline(socket, LIVENESS_TIMEOUT_MS + 1_000L, "ping:$printerName") {
        requestStatus(socket, LIVENESS_TIMEOUT_MS)
      }
    } catch (e: IOException) {
      false
    }
  }

  /** Sends DLE EOT 1 and polls for a valid status byte (0xx1xx10b). */
  private fun requestStatus(socket: BluetoothSocket, timeoutMs: Long): Boolean {
    val input = socket.inputStream
    discardPending(input)
    val out = socket.outputStream
    out.write(DLE_EOT_PRINTER)
    out.flush()
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      if (input.available() > 0) {
        val b = input.read()
        if (b < 0) throw IOException("Flux Bluetooth fermé")
        if ((b and 0x93) == 0x12) return true
        continue
      }
      Thread.sleep(STATUS_POLL_MS)
    }
    return false
  }

  /** Drop stale bytes (e.g. automatic status) so they are not read as a reply. */
  private fun discardPending(input: InputStream) {
    var n = input.available()
    while (n > 0) {
      input.skip(n.toLong())
      n = input.available()
    }
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

    try {
      val s = openMode(device, first, if (first == ConnectMode.SPP) sppMs else ch1Ms)
      preferredMode[mac] = first
      persistPreferredMode(mac, first)
      Log.i(TAG, "CONNECTED ${first.name} · $printerName")
      return s
    } catch (firstErr: IOException) {
      Log.w(TAG, "${first.name} failed · $printerName — settle then ${second.name}", firstErr)
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
