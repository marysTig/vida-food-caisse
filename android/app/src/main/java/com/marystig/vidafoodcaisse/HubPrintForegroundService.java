package com.marystig.vidafoodcaisse;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/**
 * Minimal process-keeper for the kitchen print hub.
 * Does not print itself — JS PrintQueueDaemon owns Bluetooth drain.
 */
public class HubPrintForegroundService extends Service {
  public static final String CHANNEL_ID = "hub_print_channel";
  public static final int NOTIFICATION_ID = 4202;

  @Override
  public void onCreate() {
    super.onCreate();
    ensureChannel();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    Notification notification = buildNotification();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
    } else {
      startForeground(NOTIFICATION_ID, notification);
    }
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE);
    } else {
      stopForeground(true);
    }
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationChannel channel =
        new NotificationChannel(
            CHANNEL_ID,
            "Hub d'impression",
            NotificationManager.IMPORTANCE_LOW);
    channel.setDescription("Maintient le hub cuisine actif en arrière-plan");
    channel.setShowBadge(false);
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm != null) {
      nm.createNotificationChannel(channel);
    }
  }

  private Notification buildNotification() {
    Intent launch = new Intent(this, MainActivity.class);
    launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      piFlags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent contentIntent =
        PendingIntent.getActivity(this, 0, launch, piFlags);

    return new NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle("Impression cuisine — hub actif")
        .setContentText("Cet appareil traite la file d'impression Bluetooth")
        .setSmallIcon(R.mipmap.ic_launcher)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setContentIntent(contentIntent)
        .build();
  }
}
