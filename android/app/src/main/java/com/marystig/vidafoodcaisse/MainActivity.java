package com.marystig.vidafoodcaisse;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Request Android 12+ Bluetooth runtime permissions on launch.
 * Without BLUETOOTH_SCAN, ConnectThread.cancelDiscovery() throws SecurityException
 * and kills the app when the print hub starts draining jobs.
 */
public class MainActivity extends BridgeActivity {
  private static final int BT_PERM_REQ = 4201;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    requestBluetoothPermissions();
  }

  private void requestBluetoothPermissions() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return;
    }
    String[] perms =
        new String[] {
          Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN,
        };
    boolean need = false;
    for (String p : perms) {
      if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
        need = true;
        break;
      }
    }
    if (need) {
      ActivityCompat.requestPermissions(this, perms, BT_PERM_REQ);
    }
  }
}
