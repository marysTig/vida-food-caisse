package com.marystig.vidafoodcaisse.print

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.hardware.usb.UsbManager
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Process-wide USB/BT link facts for the POS status LEDs.
 *
 * Kitchen BT is one radio: live RFCOMM is exclusive, but LEDs must stay independent.
 * MAC-switch ACL drops must not immediately mark the other kitchen offline.
 */
object PrinterLinkStatusHub {
  private const val TAG = "PrinterLinkStatus"

  /** Verified-ok window after a successful print/probe (per MAC). */
  private const val BT_OK_TTL_MS = 180_000L

  /** Delay before treating ACL-down as power-off (ignores radio handoffs). */
  private const val ACL_OK_CLEAR_DELAY_MS = 15_000L

  /** Window where ACL disconnects are attributed to our own MAC switch / probe. */
  private const val RADIO_SWITCH_GUARD_MS = 10_000L

  @Volatile var onChanged: (() -> Unit)? = null

  private val aclConnectedMacs = CopyOnWriteArraySet<String>()
  private val okBtMacAt = ConcurrentHashMap<String, Long>()
  private val pendingOkClears = ConcurrentHashMap<String, ScheduledFuture<*>>()

  private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
    Thread(r, "PrinterLinkOkClear").apply { isDaemon = true }
  }

  @Volatile private var intentionalSwitchUntilMs = 0L

  @Volatile var liveBtMac: String? = null
    private set

  @Volatile var liveUsbVid: Int? = null
    private set
  @Volatile var liveUsbPid: Int? = null
    private set

  fun normalizeMac(mac: String): String =
    mac.trim().uppercase().replace('-', ':')

  /**
   * Call before connecting/probing a different kitchen MAC so transient ACL
   * disconnects on the sibling printer do not clear its verified-ok LED.
   */
  fun markIntentionalRadioSwitch() {
    intentionalSwitchUntilMs = System.currentTimeMillis() + RADIO_SWITCH_GUARD_MS
    Log.i(TAG, "radio-switch guard ${RADIO_SWITCH_GUARD_MS}ms")
  }

  fun onUsbAttached(vendorId: Int, productId: Int) {
    Log.i(TAG, "usb attached $vendorId:$productId")
    notifyChanged()
  }

  fun onUsbDetached(vendorId: Int, productId: Int) {
    if (liveUsbVid == vendorId && liveUsbPid == productId) {
      liveUsbVid = null
      liveUsbPid = null
    }
    Log.i(TAG, "usb detached $vendorId:$productId")
    notifyChanged()
  }

  fun onUsbSessionOpened(vendorId: Int, productId: Int) {
    liveUsbVid = vendorId
    liveUsbPid = productId
    notifyChanged()
  }

  fun onUsbSessionClosed() {
    liveUsbVid = null
    liveUsbPid = null
    notifyChanged()
  }

  fun onBtAclConnected(mac: String) {
    val n = normalizeMac(mac)
    aclConnectedMacs.add(n)
    cancelOkClear(n)
    Log.i(TAG, "bt acl connected $n")
    notifyChanged()
  }

  fun onBtAclDisconnected(mac: String) {
    val n = normalizeMac(mac)
    aclConnectedMacs.remove(n)
    val now = System.currentTimeMillis()
    if (now < intentionalSwitchUntilMs) {
      Log.i(TAG, "acl disconnect · $n · ok retained (radio switch)")
      notifyChanged()
      return
    }
    // Real drop / power-off: debounce before clearing verified-ok.
    scheduleOkClear(n)
    Log.i(TAG, "bt acl disconnected $n · ok-clear in ${ACL_OK_CLEAR_DELAY_MS}ms")
    notifyChanged()
  }

  fun onBtSessionOpened(mac: String) {
    val n = normalizeMac(mac)
    liveBtMac = n
    cancelOkClear(n)
    okBtMacAt[n] = System.currentTimeMillis()
    notifyChanged()
  }

  fun onBtSessionClosed(mac: String?) {
    val n = mac?.let { normalizeMac(it) }
    if (n == null || liveBtMac == n) {
      liveBtMac = null
    }
    // Do not clear okBtMacAt — sibling kitchens must keep their verified LED.
    notifyChanged()
  }

  fun onBtSuccess(mac: String) {
    val n = normalizeMac(mac)
    cancelOkClear(n)
    okBtMacAt[n] = System.currentTimeMillis()
    notifyChanged()
  }

  fun isAclConnected(mac: String): Boolean =
    aclConnectedMacs.contains(normalizeMac(mac))

  private fun isRecentBtOk(mac: String): Boolean {
    val at = okBtMacAt[mac] ?: return false
    return System.currentTimeMillis() - at < BT_OK_TTL_MS
  }

  private fun scheduleOkClear(mac: String) {
    cancelOkClear(mac)
    val future = scheduler.schedule({
      okBtMacAt.remove(mac)
      pendingOkClears.remove(mac)
      Log.i(TAG, "ok cleared after ACL down · $mac")
      notifyChanged()
    }, ACL_OK_CLEAR_DELAY_MS, TimeUnit.MILLISECONDS)
    pendingOkClears[mac] = future
  }

  private fun cancelOkClear(mac: String) {
    pendingOkClears.remove(mac)?.cancel(false)
  }

  @SuppressLint("MissingPermission")
  fun buildStatusArray(
    context: Context,
    printers: JSArray?,
  ): JSArray {
    val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    val adapter = BluetoothAdapter.getDefaultAdapter()
    val out = JSArray()
    if (printers == null) {
      Log.w(TAG, "buildStatusArray: printers null")
      return out
    }

    for (i in 0 until printers.length()) {
      val raw = coerceToJSObject(printers.opt(i))
      if (raw == null) {
        Log.w(TAG, "skip printer[$i] type=${printers.opt(i)?.javaClass?.name}")
        continue
      }
      val id = raw.getString("id") ?: continue
      val transport = raw.getString("transport")?.lowercase() ?: "bluetooth"
      val name = raw.getString("name") ?: "imprimante"
      val o = JSObject()
      o.put("id", id)
      o.put("name", name)
      o.put("transport", transport)

      if (transport == "usb") {
        val vid = intOrNull(raw, "vendorId")
        val pid = intOrNull(raw, "productId")
        if (vid == null || pid == null) {
          o.put("state", "unconfigured")
          o.put("detail", "VID/PID manquant")
        } else {
          val device = usbManager.deviceList.values.firstOrNull {
            it.vendorId == vid && it.productId == pid
          }
          val present = device != null
          val permission = device != null && usbManager.hasPermission(device)
          val live = liveUsbVid == vid && liveUsbPid == pid
          val state = when {
            !present -> "disconnected"
            !permission -> "no_permission"
            else -> "ready"
          }
          o.put("state", state)
          o.put("present", present)
          o.put("permission", permission)
          o.put("live", live)
          o.put(
            "detail",
            when (state) {
              "ready" -> if (live) "USB connectée" else "USB branchée"
              "no_permission" -> "Permission USB requise"
              else -> "USB débranchée"
            },
          )
        }
      } else {
        val mac = raw.getString("macAddress")?.let { normalizeMac(it) }.orEmpty()
        if (mac.isBlank()) {
          o.put("state", "unconfigured")
          o.put("detail", "MAC manquante")
        } else if (adapter == null || !adapter.isEnabled) {
          o.put("state", "disconnected")
          o.put("detail", "Bluetooth désactivé")
          o.put("bonded", false)
          o.put("live", false)
          o.put("aclConnected", false)
        } else {
          val bonded = adapter.bondedDevices?.any {
            normalizeMac(it.address) == mac
          } == true
          val live = liveBtMac == mac
          val acl = isAclConnected(mac)
          val lastOk = isRecentBtOk(mac)
          // Green only when we have a live RFCOMM session or a recent successful
          // print/probe. ACL alone is a false green (Logcat: ACL up while CHANNEL1 fails).
          val state = when {
            !bonded -> "disconnected"
            live || lastOk -> "ready"
            acl -> "pending"
            else -> "disconnected"
          }
          o.put("state", state)
          o.put("bonded", bonded)
          o.put("live", live)
          o.put("aclConnected", acl)
          o.put("verified", lastOk)
          o.put(
            "detail",
            when {
              !bonded -> "BT non appairée"
              live -> "BT session"
              lastOk -> "BT prête"
              acl -> "BT lien — en attente"
              else -> "BT hors ligne"
            },
          )
        }
      }
      out.put(o)
    }
    return out
  }

  private fun coerceToJSObject(raw: Any?): JSObject? {
    return when (raw) {
      null -> null
      is JSObject -> raw
      is JSONObject -> JSObject.fromJSONObject(raw)
      is Map<*, *> -> {
        val o = JSObject()
        for ((k, v) in raw) {
          if (k is String && v != null) o.put(k, v)
        }
        o
      }
      else -> try {
        JSObject(raw.toString())
      } catch (_: Exception) {
        null
      }
    }
  }

  private fun intOrNull(obj: JSObject, key: String): Int? {
    if (!obj.has(key) || obj.isNull(key)) return null
    return when (val v = obj.get(key)) {
      is Number -> v.toInt()
      is String -> v.toIntOrNull()
      else -> null
    }
  }

  private fun notifyChanged() {
    try {
      onChanged?.invoke()
    } catch (e: Exception) {
      Log.w(TAG, "onChanged failed: ${e.message}")
    }
  }
}
