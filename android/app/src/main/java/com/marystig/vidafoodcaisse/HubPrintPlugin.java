package com.marystig.vidafoodcaisse;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HubPrint")
public class HubPrintPlugin extends Plugin {

  @PluginMethod
  public void start(PluginCall call) {
    try {
      Intent intent = new Intent(getContext(), HubPrintForegroundService.class);
      ContextCompat.startForegroundService(getContext(), intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("Failed to start hub foreground service: " + e.getMessage(), e);
    }
  }

  @PluginMethod
  public void stop(PluginCall call) {
    try {
      Intent intent = new Intent(getContext(), HubPrintForegroundService.class);
      getContext().stopService(intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("Failed to stop hub foreground service: " + e.getMessage(), e);
    }
  }
}
