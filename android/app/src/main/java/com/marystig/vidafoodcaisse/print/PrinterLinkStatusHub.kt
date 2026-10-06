package com.marystig.vidafoodcaisse.print

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.hardware.usb.UsbManager
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Process-wide USB/BT link facts for the POS status LEDs.
 * Pushes change notifications to [HubPrintWorkerPlugin] via [onChanged].
 */
object PrinterLinkStatusHub {
  private const val TAG = "PrinterLinkStatus"

  @Volatile var onChanged: (() -> Unit)? = null

  /** MACs with an active ACL (from system broadcasts). */
  private val aclConnectedMacs = CopyOnWriteArraySet<String>()

  /** MACs that successfully printed/probed this process. */
  private val okBtMacs = CopyOnWriteArraySet<String>()

  /** Last known live BT keep-alive MAC from EscPosBluetoothPrinter. */
  @Volatile var liveBtMac: String? = null
    private set

  /** Live USB session VID/PID (null if none). */
  @Volatile var liveUsbVid: Int? = null
    private set
  @Volatile var liveUsbPid: Int? = null
    private set

  fun normalizeMac(mac: String): String =
    mac.trim().uppercase().replace('-', ':')

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
    aclConnectedMacs.add(normalizeMac(mac))
    Log.i(TAG, "bt acl connected $mac")
    // #region agent log
    Log.i(
      "PrinterLinkDebug",
      """{"sessionId":"5eee2c","hypothesisId":"C","location":"PrinterLinkStatusHub.kt:acl","message":"acl-connected","data":{"mac":"${normalizeMac(mac)}"},"timestamp":${System.currentTimeMillis()}}""",
    )
    // #endregion
    notifyChanged()
  }

  fun onBtAclDisconnected(mac: String) {
    aclConnectedMacs.remove(normalizeMac(mac))
    Log.i(TAG, "bt acl disconnected $mac")
    // #region agent log
    Log.i(
      "PrinterLinkDebug",
      """{"sessionId":"5eee2c","hypothesisId":"C","location":"PrinterLinkStatusHub.kt:acl","message":"acl-disconnected","data":{"mac":"${normalizeMac(mac)}"},"timestamp":${System.currentTimeMillis()}}""",
    )
    // #endregion
    notifyChanged()
  }

  fun onBtSessionOpened(mac: String) {
    val n = normalizeMac(mac)
    liveBtMac = n
    okBtMacs.add(n)
    notifyChanged()
  }

  fun onBtSessionClosed(mac: String?) {
    val n = mac?.let { normalizeMac(it) }
    if (n == null || liveBtMac == n) {
      liveBtMac = null
    }
    notifyChanged()
  }

  fun onBtSuccess(mac: String) {
    okBtMacs.add(normalizeMac(mac))
    notifyChanged()
  }

  fun isAclConnected(mac: String): Boolean =
    aclConnectedMacs.contains(normalizeMac(mac))

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

    Log.i(TAG, "buildStatusArray count=${printers.length()}")
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
          val lastOk = okBtMacs.contains(mac)
          // Bonded = hardware ready for kitchen use (RFCOMM is on-demand).
          // Pending only when not bonded yet / adapter issues handled above.
          val state = when {
            !bonded -> "disconnected"
            else -> "ready"
          }
          // #region agent log
          Log.i(
            "PrinterLinkDebug",
            """{"sessionId":"5eee2c","hypothesisId":"A","location":"PrinterLinkStatusHub.kt:bt","message":"bt-link-facts","data":{"id":"$id","name":"$name","mac":"$mac","bonded":$bonded,"live":$live,"acl":$acl,"lastOk":$lastOk,"state":"$state"},"timestamp":${System.currentTimeMillis()}}""",
          )
          // #endregion
          o.put("state", state)
          o.put("bonded", bonded)
          o.put("live", live)
          o.put("aclConnected", acl)
          o.put("verified", lastOk)
          o.put(
            "detail",
            when {
              !bonded -> "BT non appairée"
              live || acl -> "BT connectée"
              lastOk -> "BT prête"
              else -> "BT appairée"
            },
          )
        }
      }
      out.put(o)
    }
    Log.i(TAG, "buildStatusArray out=${out.length()}")
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
