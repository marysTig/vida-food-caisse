/**
 * RealtimeManager — Gestionnaire de cycle de vie Supabase Realtime
 *
 * Responsabilités :
 *  - Créer et maintenir un channel Supabase Realtime
 *  - Gérer tous les statuts : SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED
 *  - Reconnexion automatique avec backoff exponentiel (1s→2s→4s→8s→16s→30s max)
 *  - Supprimer l'ancien channel avant d'en recréer un nouveau
 *  - Empêcher plusieurs reconnexions simultanées
 *  - Empêcher les channels dupliqués
 *  - Resync depuis Supabase après reconnexion ou retour au foreground
 *  - Cleanup propre (channels + timers)
 *
 * NE CONTIENT AUCUNE LOGIQUE MÉTIER.
 */

import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ── Types publics ─────────────────────────────────────────────────────────────

export type PostgresPayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export type ChannelListener = {
  /** Schéma Postgres (ex: "public") */
  schema: string;
  /** Nom de la table à écouter */
  table: string;
  /** Callback appelé à chaque événement Realtime */
  onPayload: (payload: PostgresPayload) => void;
};

export type RealtimeManagerOptions = {
  /** Nom unique du channel Supabase */
  channelName: string;
  /** Liste des tables/schémas à écouter */
  listeners: ChannelListener[];
  /**
   * Appelé après une reconnexion réussie (SUBSCRIBED) ou un retour au foreground.
   * Doit rechargement les données depuis Supabase (source de vérité).
   */
  onResync: () => Promise<void>;
};

// ── Constantes backoff ────────────────────────────────────────────────────────

const BACKOFF_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

// ── Classe RealtimeManager ────────────────────────────────────────────────────

export class RealtimeManager {
  private readonly _name: string;
  private readonly _listeners: ChannelListener[];
  private readonly _onResync: () => Promise<void>;

  private _channel: RealtimeChannel | null = null;
  private _initialized = false;
  private _reconnecting = false;
  private _destroyed = false;
  private _backoffIndex = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _isFirstSubscription = true;

  constructor(options: RealtimeManagerOptions) {
    this._name = options.channelName;
    this._listeners = options.listeners;
    this._onResync = options.onResync;
  }

  // ── API publique ────────────────────────────────────────────────────────────

  /**
   * Initialise le chargement initial + la subscription Realtime.
   * Idempotent : plusieurs appels consécutifs sont sans effet.
   */
  async init(): Promise<void> {
    if (this._initialized || this._destroyed) return;
    this._log("INIT — chargement initial + subscription");

    try {
      await this._onResync();
    } catch (err) {
      this._log("INIT ERROR — resync échoué, réessai au prochain init()", err);
      return; // _initialized reste false
    }

    this._initialized = true;
    this._subscribe();
  }

  /**
   * Appelé lors du retour au premier plan (Capacitor appStateChange).
   * Vérifie l'état du channel et resync si nécessaire.
   */
  async handleForeground(): Promise<void> {
    if (this._destroyed) return;
    this._log("FOREGROUND — vérification du channel");

    const channelState = this._channel?.state;

    if (channelState !== "joined") {
      this._log(`FOREGROUND — channel dans l'état "${channelState}", recréation`);
      // Ne pas attendre un backoff, forcer la reconnexion immédiatement
      this._clearReconnectTimer();
      this._backoffIndex = 0;
      this._scheduleReconnect(0);
    } else {
      // Channel toujours vivant : juste un resync des données manquées
      this._log("FOREGROUND — channel OK, RESYNC données");
      await this._safeResync();
    }
  }

  /**
   * Cleanup complet : supprime le channel et annule tous les timers.
   * À appeler dans le cleanup du useEffect React (ou à la destruction de l'app).
   */
  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    this._clearReconnectTimer();
    await this._removeChannel();
    this._initialized = false;
    this._log("DESTROYED");
  }

  // ── Subscription ────────────────────────────────────────────────────────────

  private _subscribe(): void {
    if (this._destroyed) return;

    // Toujours supprimer l'ancien channel avant d'en créer un nouveau
    void this._removeChannel().then(() => {
      if (this._destroyed) return;

      let ch = supabase.channel(this._name);

      for (const listener of this._listeners) {
        ch = ch.on(
          "postgres_changes",
          { event: "*", schema: listener.schema, table: listener.table },
          (payload) => {
            if (!this._destroyed) listener.onPayload(payload as PostgresPayload);
          },
        );
      }

      ch.subscribe((status, err) => {
        this._handleStatus(status, err);
      });

      this._channel = ch;
      this._log("CHANNEL CRÉÉ — en attente de SUBSCRIBED");
    });
  }

  // ── Gestion des statuts ──────────────────────────────────────────────────────

  private _handleStatus(status: string, err?: Error): void {
    switch (status) {
      case "SUBSCRIBED":
        this._log("SUBSCRIBED ✅");
        this._backoffIndex = 0; // Reset backoff après succès
        this._reconnecting = false;
        
        if (this._isFirstSubscription) {
          this._isFirstSubscription = false;
          // Les données ont déjà été chargées via init() juste avant la souscription.
        } else {
          // Resync après reconnexion pour récupérer les événements manqués
          void this._safeResync();
        }
        break;

      case "CHANNEL_ERROR":
        this._log("CHANNEL_ERROR ❌", err);
        this._invalidateAndReconnect();
        break;

      case "TIMED_OUT":
        // CRITIQUE : TIMED_OUT doit aussi invalider, sinon _initialized reste bloqué
        this._log("TIMED_OUT ⏱ — invalide et reconnexion");
        this._invalidateAndReconnect();
        break;

      case "CLOSED":
        this._log("CLOSED 🔒");
        this._invalidateAndReconnect();
        break;

      default:
        this._log(`STATUS inconnu: ${status}`);
    }
  }

  private _invalidateAndReconnect(): void {
    if (this._destroyed) return;
    // Réinitialiser l'état pour permettre une nouvelle subscription
    this._initialized = false;
    this._reconnecting = false; // Permettre une nouvelle tentative
    this._scheduleReconnect();
  }

  // ── Reconnexion avec backoff ─────────────────────────────────────────────────

  private _scheduleReconnect(overrideDelayMs?: number): void {
    if (this._destroyed) return;
    if (this._reconnecting) {
      this._log("RECONNECT déjà planifié — ignoré");
      return;
    }

    this._reconnecting = true;
    this._clearReconnectTimer();

    const delay = overrideDelayMs ?? BACKOFF_DELAYS_MS[Math.min(this._backoffIndex, BACKOFF_DELAYS_MS.length - 1)];
    this._backoffIndex = Math.min(this._backoffIndex + 1, BACKOFF_DELAYS_MS.length - 1);

    this._log(`RECONNECTING — tentative dans ${delay}ms (backoff index ${this._backoffIndex})`);

    this._reconnectTimer = setTimeout(async () => {
      this._reconnecting = false;
      if (!this._destroyed) {
        this._log("RESYNC + RE-SUBSCRIBE");
        // Resync complet depuis Supabase avant de recréer le channel
        await this._safeResync();
        this._initialized = true;
        this._subscribe();
      }
    }, delay);
  }

  private _clearReconnectTimer(): void {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async _removeChannel(): Promise<void> {
    if (this._channel) {
      this._log("CHANNEL REMOVED");
      try {
        await supabase.removeChannel(this._channel);
      } catch {
        // Ignorer les erreurs de suppression (channel déjà mort)
      }
      this._channel = null;
    }
  }

  private async _safeResync(): Promise<void> {
    this._log("RESYNC — rechargement données depuis Supabase");
    try {
      await this._onResync();
    } catch (err) {
      this._log("RESYNC ERROR", err);
    }
  }

  private _log(message: string, extra?: unknown): void {
    if (extra !== undefined) {
      console.log(`[Realtime:${this._name}] ${message}`, extra);
    } else {
      console.log(`[Realtime:${this._name}] ${message}`);
    }
  }
}
