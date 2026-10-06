package com.marystig.vidafoodcaisse;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

/**
 * Request Android 12+ Bluetooth runtime permissions on launch.
 * Without BLUETOOTH_SCAN, ConnectThread.cancelDiscovery() throws SecurityException
 * and kills the app when the print hub starts draining jobs.
 * Also requests POST_NOTIFICATIONS (API 33+) for the hub FGS notification.
 */
public class MainActivity extends BridgeActivity {
  private static final int BT_PERM_REQ = 4201;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(HubPrintWorkerPlugin.class);
    super.onCreate(savedInstanceState);
    requestRuntimePermissions();
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
