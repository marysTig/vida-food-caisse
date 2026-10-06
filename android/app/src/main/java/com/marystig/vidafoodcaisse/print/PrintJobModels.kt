package com.marystig.vidafoodcaisse.print

import org.json.JSONObject

data class NativePrintJob(
  val id: String,
  val jobType: String,
  val priority: Int,
  val printerId: String?,
  val printerName: String?,
  val macAddress: String?,
  val transport: String,
  val usbVendorId: Int?,
  val usbProductId: Int?,
  val attemptCount: Int,
  val payload: JSONObject,
  val tableId: String?,
) {
  val escposBase64: String?
    get() = payload.optString("escposBase64", "").takeIf { it.isNotBlank() }

  val fingerprints: JSONObject?
    get() = payload.optJSONObject("fingerprints")

  val isUsb: Boolean
    get() =
      transport.equals("usb", ignoreCase = true) ||
        (usbVendorId != null && usbProductId != null)

  companion object {
    fun fromJson(row: JSONObject): NativePrintJob {
      val payload = row.optJSONObject("payload") ?: JSONObject()
      val transportRaw = row.optString("transport", "").ifBlank {
        payload.optString("transport", "bluetooth")
      }.ifBlank { "bluetooth" }

      val usbVid = row.optIntOrNull("usb_vendor_id")
        ?: payload.optIntOrNull("usbVendorId")
      val usbPid = row.optIntOrNull("usb_product_id")
        ?: payload.optIntOrNull("usbProductId")

      return NativePrintJob(
        id = row.getString("id"),
        jobType = row.optString("job_type", "kitchen"),
        priority = row.optInt("priority", 10),
        printerId = row.optString("printer_id", null),
        printerName = row.optString("printer_name", null),
        macAddress = row.optString("mac_address", null)?.trim()?.takeIf { it.isNotEmpty() },
        transport = transportRaw.lowercase(),
        usbVendorId = usbVid,
        usbProductId = usbPid,
        attemptCount = row.optInt("attempt_count", 0),
        payload = payload,
        tableId = payload.optString("tableId", null)?.takeIf { it.isNotBlank() }
          ?: row.optString("table_id", null)?.takeIf { it.isNotBlank() },
      )
    }

    private fun JSONObject.optIntOrNull(key: String): Int? {
      if (!has(key) || isNull(key)) return null
      return try {
        getInt(key)
      } catch (_: Exception) {
        null
      }
    }
  }
}
