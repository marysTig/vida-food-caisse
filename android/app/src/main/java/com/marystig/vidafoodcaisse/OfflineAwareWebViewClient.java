package com.marystig.vidafoodcaisse;

import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * The POS UI is loaded from the remote server (capacitor server.url). When the
 * main page cannot load (Wi-Fi drop, DNS failure, Vercel 5xx) Android showed its
 * dead "Page Web non disponible" screen until someone restarted the app.
 *
 * Capacitor's server.errorPath cannot help here: with a remote server.url it is
 * resolved against the remote host, which is exactly what is unreachable.
 * This client swaps in a bundled page (res/raw/offline.html) that probes the
 * server every 3s and returns to the page that failed as soon as it answers.
 * The native print worker keeps running meanwhile.
 */
public class OfflineAwareWebViewClient extends BridgeWebViewClient {
  private static final String TAG = "OfflineWebView";
  private final String appUrl;

  public OfflineAwareWebViewClient(Bridge bridge, String appUrl) {
    super(bridge);
    this.appUrl = appUrl;
  }

  @Override
  public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
    super.onReceivedError(view, request, error);
    if (request.isForMainFrame()) {
      Log.w(TAG, "main frame failed · " + error.getErrorCode() + " · " + error.getDescription());
      showOffline(view, request.getUrl());
    }
  }

  @Override
  public void onReceivedHttpError(
      WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
    super.onReceivedHttpError(view, request, errorResponse);
    if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
      Log.w(TAG, "main frame HTTP " + errorResponse.getStatusCode());
      showOffline(view, request.getUrl());
    }
  }

  private void showOffline(WebView view, Uri failed) {
    String html = loadOfflineHtml(view);
    if (html == null) return;
    String target = appUrl;
    if (failed != null) {
      Uri app = Uri.parse(appUrl);
      // Return to the screen that failed (e.g. /tables), never to a foreign host.
      if (app.getHost() != null && app.getHost().equals(failed.getHost())) {
        target = failed.toString();
      }
    }
    html = html.replace("__TARGET_URL__", jsString(target)).replace("__PROBE_URL__", jsString(appUrl));
    view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
  }

  private static String jsString(String s) {
    return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("<", "\\u003c");
  }

  private static String loadOfflineHtml(WebView view) {
    try (InputStream in = view.getContext().getResources().openRawResource(R.raw.offline)) {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buf = new byte[4096];
      int n;
      while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
      return out.toString("UTF-8");
    } catch (Exception e) {
      Log.e(TAG, "offline page unavailable", e);
      return null;
    }
  }
}
