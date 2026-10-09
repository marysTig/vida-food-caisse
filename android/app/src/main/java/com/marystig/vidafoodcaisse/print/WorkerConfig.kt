package com.marystig.vidafoodcaisse.print

import android.content.Context
import android.content.SharedPreferences

/**
 * Persists hub worker credentials so FGS can restart after process death
 * without reading WebView localStorage.
 */
object WorkerConfig {
  private const val PREFS = "vida_hub_print_worker"
  private const val KEY_DEVICE_ID = "device_id"
  private const val KEY_SUPABASE_URL = "supabase_url"
  private const val KEY_ANON_KEY = "supabase_anon_key"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_LANE_MODE = "bt_lane_mode"

  /** Last print_settings.bt_lane_mode seen — used at boot before Supabase answers. */
  fun laneMode(ctx: Context): String =
    prefs(ctx).getString(KEY_LANE_MODE, null) ?: HubSettings.MODE_PARALLEL

  fun setLaneMode(ctx: Context, mode: String) {
    prefs(ctx).edit().putString(KEY_LANE_MODE, mode).apply()
  }

  private fun prefs(ctx: Context): SharedPreferences =
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(
    ctx: Context,
    deviceId: String,
    supabaseUrl: String,
    anonKey: String,
  ) {
    prefs(ctx).edit()
      .putString(KEY_DEVICE_ID, deviceId.trim())
      .putString(KEY_SUPABASE_URL, supabaseUrl.trim().trimEnd('/'))
      .putString(KEY_ANON_KEY, anonKey.trim())
      .putBoolean(KEY_ENABLED, true)
      .apply()
  }

  fun setEnabled(ctx: Context, enabled: Boolean) {
    prefs(ctx).edit().putBoolean(KEY_ENABLED, enabled).apply()
  }

  fun isEnabled(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_ENABLED, false)

  fun deviceId(ctx: Context): String? =
    prefs(ctx).getString(KEY_DEVICE_ID, null)?.takeIf { it.isNotBlank() }

  fun supabaseUrl(ctx: Context): String? =
    prefs(ctx).getString(KEY_SUPABASE_URL, null)?.takeIf { it.isNotBlank() }

  fun anonKey(ctx: Context): String? =
    prefs(ctx).getString(KEY_ANON_KEY, null)?.takeIf { it.isNotBlank() }

  fun isConfigured(ctx: Context): Boolean =
    !deviceId(ctx).isNullOrBlank() &&
      !supabaseUrl(ctx).isNullOrBlank() &&
      !anonKey(ctx).isNullOrBlank()
}
