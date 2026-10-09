package com.marystig.vidafoodcaisse;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.marystig.vidafoodcaisse.print.PrintWorkerLoop;
import com.marystig.vidafoodcaisse.print.WorkerRuntime;
import java.util.ArrayList;
import java.util.List;

/**
 * Request Android 12+ Bluetooth runtime permissions on launch.
 * Without BLUETOOTH_SCAN, ConnectThread.cancelDiscovery() throws SecurityException
 * and kills the app when the print hub starts draining jobs.
 * Also requests POST_NOTIFICATIONS (API 33+) for the hub FGS notification.
 * USB OTG: device_filter.xml + USB_DEVICE_ATTACHED → warm reconnect without Admin.
 */
public class MainActivity extends BridgeActivity {
  private static final int BT_PERM_REQ = 4201;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(HubPrintWorkerPlugin.class);
    super.onCreate(savedInstanceState);
    requestRuntimePermissions();
    // No clearCache() on launch: Vercel serves HTML with must-revalidate and JS
    // with immutable hashed names, so the cache is never stale — wiping it only
    // forced a full re-download on every start (slow / fails on weak Wi-Fi).
    Bridge bridge = getBridge();
    if (bridge != null && bridge.getServerUrl() != null) {
      bridge.setWebViewClient(new OfflineAwareWebViewClient(bridge, bridge.getServerUrl()));
    }
    handleUsbAttachIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleUsbAttachIntent(intent);
  }

  /**
   * Manifest intent-filter + @xml/device_filter delivers ATTACHED here (including
   * when the app is already open via singleTask). Forward to the hub USB thread.
   */
  private void handleUsbAttachIntent(Intent intent) {
    if (intent == null) return;
    if (!UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(intent.getAction())) return;

    UsbDevice device;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
    } else {
      device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
    }
    if (device == null) return;

    PrintWorkerLoop loop = WorkerRuntime.INSTANCE.getLoop();
    if (loop == null) return;
    loop.onUsbDeviceAttached(device);
  }

  private void requestRuntimePermissions() {
    List<String> needed = new ArrayList<>();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
          != PackageManager.PERMISSION_GRANTED) {
        needed.add(Manifest.permission.BLUETOOTH_CONNECT);
      }
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN)
          != PackageManager.PERMISSION_GRANTED) {
        needed.add(Manifest.permission.BLUETOOTH_SCAN);
      }
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
          != PackageManager.PERMISSION_GRANTED) {
        needed.add(Manifest.permission.POST_NOTIFICATIONS);
      }
    }

    if (!needed.isEmpty()) {
      ActivityCompat.requestPermissions(
          this, needed.toArray(new String[0]), BT_PERM_REQ);
    }
  }
}
