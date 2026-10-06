package com.marystig.vidafoodcaisse

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.marystig.vidafoodcaisse.print.EscPosUsbPrinter
import com.marystig.vidafoodcaisse.print.WorkerConfig
import com.marystig.vidafoodcaisse.print.WorkerRuntime

@CapacitorPlugin(name = "HubPrintWorker")
class HubPrintWorkerPlugin : Plugin() {

  @PluginMethod
  fun startWorker(call: PluginCall) {
    try {
      val deviceId = call.getString("deviceId")?.trim().orEmpty()
      val supabaseUrl = call.getString("supabaseUrl")?.trim().orEmpty()
      val anonKey = call.getString("supabaseAnonKey")?.trim().orEmpty()
      if (deviceId.isEmpty() || supabaseUrl.isEmpty() || anonKey.isEmpty()) {
        call.reject("deviceId, supabaseUrl et supabaseAnonKey sont requis")
        return
      }
      WorkerConfig.save(context, deviceId, supabaseUrl, anonKey)
      HubPrintWorkerService.start(context)
      val ret = JSObject()
      ret.put("running", true)
      call.resolve(ret)
    } catch (e: Exception) {
      call.reject("startWorker failed: ${e.message}", e)
    }
  }

  @PluginMethod
  fun stopWorker(call: PluginCall) {
    try {
      HubPrintWorkerService.stop(context)
      WorkerConfig.setEnabled(context, false)
      call.resolve()
    } catch (e: Exception) {
      call.reject("stopWorker failed: ${e.message}", e)
    }
  }

  @PluginMethod
  fun getWorkerStatus(call: PluginCall) {
    val ret = JSObject()
    ret.put("running", WorkerRuntime.running)
    ret.put("queueDepth", WorkerRuntime.queueDepth)
    ret.put("lastError", WorkerRuntime.lastError)
    ret.put("configured", WorkerConfig.isConfigured(context))
    call.resolve(ret)
  }

  @PluginMethod
  fun triggerManualRetry(call: PluginCall) {
    val loop = WorkerRuntime.loop
    if (loop == null || !loop.isRunning()) {
      call.reject("Worker non démarré")
      return
    }
    loop.triggerManualRetry()
    call.resolve()
  }

  @PluginMethod
  fun wakeWorker(call: PluginCall) {
    WorkerRuntime.loop?.wake()
    call.resolve()
  }

  @PluginMethod
  fun listUsbDevices(call: PluginCall) {
    try {
      val devices = WorkerRuntime.loop?.listUsbDevices()
        ?: EscPosUsbPrinter(context.applicationContext).listDevices()
      val arr = JSArray()
      for (d in devices) {
        val o = JSObject()
        o.put("vendorId", d.vendorId)
        o.put("productId", d.productId)
        o.put("deviceName", d.deviceName)
        o.put("productName", d.productName)
        o.put("hasPermission", d.hasPermission)
        arr.put(o)
      }
      val ret = JSObject()
      ret.put("devices", arr)
      call.resolve(ret)
    } catch (e: Exception) {
      call.reject("listUsbDevices failed: ${e.message}", e)
    }
  }

  @PluginMethod
  fun adminProbe(call: PluginCall) {
    val transport = call.getString("transport")?.trim()?.lowercase() ?: "bluetooth"
    val name = call.getString("printerName")?.trim() ?: "imprimante"
    val loop = WorkerRuntime.loop
    if (loop == null || !loop.isRunning()) {
      call.reject("Worker non démarré — lancez le hub natif d'abord")
      return
    }
    try {
      val (ok, detail) = if (transport == "usb") {
        val vid = call.getInt("vendorId")
          ?: run {
            call.reject("vendorId requis pour USB")
            return
          }
        val pid = call.getInt("productId")
          ?: run {
            call.reject("productId requis pour USB")
            return
          }
        loop.adminUsbProbe(name, vid, pid)
      } else {
        val mac = call.getString("macAddress")?.trim().orEmpty()
        if (mac.isEmpty()) {
          call.reject("macAddress requis")
          return
        }
        loop.adminProbe(name, mac)
      }
      val ret = JSObject()
      ret.put("ok", ok)
      ret.put("detail", detail)
      call.resolve(ret)
    } catch (e: Exception) {
      call.reject(e.message ?: "adminProbe failed", e)
    }
  }

  @PluginMethod
  fun adminTestPrint(call: PluginCall) {
    val transport = call.getString("transport")?.trim()?.lowercase() ?: "bluetooth"
    val name = call.getString("printerName")?.trim() ?: "imprimante"
    val b64 = call.getString("escposBase64")?.trim().orEmpty()
    if (b64.isEmpty()) {
      call.reject("escposBase64 requis")
      return
    }
    val loop = WorkerRuntime.loop
    if (loop == null || !loop.isRunning()) {
      call.reject("Worker non démarré — lancez le hub natif d'abord")
      return
    }
    try {
      val (ok, detail) = if (transport == "usb") {
        val vid = call.getInt("vendorId")
          ?: run {
            call.reject("vendorId requis pour USB")
            return
          }
        val pid = call.getInt("productId")
          ?: run {
            call.reject("productId requis pour USB")
            return
          }
        loop.adminUsbTestPrint(name, vid, pid, b64)
      } else {
        val mac = call.getString("macAddress")?.trim().orEmpty()
        if (mac.isEmpty()) {
          call.reject("macAddress et escposBase64 requis")
          return
        }
        loop.adminTestPrint(name, mac, b64)
      }
      if (!ok) {
        call.reject(detail)
        return
      }
      val ret = JSObject()
      ret.put("ok", true)
      ret.put("detail", detail)
      call.resolve(ret)
    } catch (e: Exception) {
      call.reject(e.message ?: "adminTestPrint failed", e)
    }
  }
}
