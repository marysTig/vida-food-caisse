# AUDIT DE SYNCHRONISATION TEMPS RÉEL (TABLES)

## 1. ARCHITECTURE DES TABLES

* **Table contenant les tables** : `tables`
* **Colonnes pertinentes** : `id`, `number`, `seats`, `status`, `room_id`, `order_total`, `occupied_since`, `parent_table_id`, `created_at`.
* **Colonne de statut** : `status`
* **Valeurs possibles** : `"libre" | "occupee" | "reservee"`
* **Identification d'une table** : UUID (colonne `id`).
* **Lien commande/table** : Une commande est liée via la colonne `table_id` dans la table `table_orders`.
* **Table des commandes** : `table_orders`
* **Relation SQL** : Il existe une relation logique entre `table_orders.table_id` et `tables.id` (souvent configurée comme Foreign Key dans Supabase).
* **Source de vérité du statut** : Supabase. Le statut n'est pas calculé dynamiquement à partir des commandes, il est stocké explicitement dans la colonne `status` de la table `tables`.

## 2. CRÉATION D'UNE COMMANDE PAR LE SERVEUR

**Parcours exact :**
1. **Serveur** (Appareil Android)
2. **Interface** : `TableOrderSidebar` (`src/components/pos/TableOrderSidebar.tsx`)
3. **Fonction** : Le serveur clique sur "Valider la commande" qui appelle `handleValidateOrder()`.
4. **API/Hook** : Appel de la fonction `updateTable(tableId, payload)` fournie par le hook `useTableStore()`.
5. **Requête Supabase** : `supabase.from("tables").update(payload).eq("id", id)`
6. **Données envoyées** : `{ status: "occupee", orderTotal: total, occupiedSince: now }`
7. **Table modifiée** : `tables`
8. **Moment de modification** :
   * L'état local du serveur change *immédiatement* via une mise à jour optimiste (Zustand).
   * La requête Supabase est envoyée simultanément pour persister le changement.
   * *En parallèle*, `useEffect` dans `TableOrderSidebar` déclenche `setOrder` qui exécute `scheduleUpsert` vers la table `table_orders`.

## 3. MODIFICATION DU STATUT DE LA TABLE

* **Où** : Dans le fichier `src/lib/tableStore.ts`.
* **Fonction** : `updateTable`
* **Est-ce un UPDATE Supabase ?** Oui.
* **Code/Requête utilisé** : `const { error } = await supabase.from("tables").update(payload).eq("id", id);`
* **Enregistrement en DB** : Oui, le changement est réellement envoyé à Supabase.
* **State React local** : Oui, il y a un "Optimistic Update" (`setTables(...)`) juste avant la requête Supabase.
* **Plusieurs endroits modifient le statut ?** L'interface d'encaissement et l'admin modifient aussi la table via cette même fonction `updateTable`.
* **Risque d'incohérence** : Possible. Étant donné que `tables.status` et `table_orders.items` sont mis à jour via deux appels distincts (un `update` sur `tables` et un `upsert` différé sur `table_orders`), une micro-coupure réseau pourrait rendre une table occupée sans commande associée.

## 4. AFFICHAGE DES TABLES SUR LA TABLETTE DU CAISSIER

* **Composant** : `TablesPage` (`src/routes/tables.tsx`), qui boucle sur `TableCard`.
* **Hook** : `useTableStore()` qui consomme le state global Zustand `useTableGlobalState`.
* **Chargement initial** : Au montage de l'application (via `_initTableSync()` dans `__root.tsx`).
* **Subscription Realtime** : Oui. `useTableSync()` crée l'écouteur.
* **State local mis à jour ?** Oui, le callback Realtime appelle `store.setTables(...)` ce qui met à jour Zustand.
* **Interface** : Elle utilise le state Zustand réactif (`tableData`), pas directement la base de données.
* **Quand une table est modifiée ailleurs** : L'événement Realtime modifie Zustand, ce qui déclenche un re-render de `TablesPage`.

## 5. SUPABASE REALTIME

**Subscriptions existantes :**

1. **Tables & Salles** (`src/lib/tableStore.ts`)
   * **Canal** : `"tables-rooms-realtime"`
   * **Fonction** : `_initTableSync()`
   * **Table écoutée** : `rooms` (event: `*`), `tables` (event: `*`)
   * **Filtre** : schema `"public"`
   * **Création** : `__root.tsx` appelle `useTableSync()` au montage.
   * **Nettoyage** : **AUCUN**. `useEffect` ne retourne pas de fonction de nettoyage (ex: `removeChannel`).
   * **À la réception** : `store.setTables()` ou `store.setRooms()` modifie Zustand de façon immuable.

2. **Commandes** (`src/lib/tableOrdersStore.ts`)
   * **Canal** : `"table-orders-realtime"`
   * **Fonction** : `_initTableOrdersSync()`
   * **Table écoutée** : `table_orders` (event: `*`)
   * **Nettoyage** : **AUCUN**.

**Vérification UPDATE** : Oui, la subscription `tables` écoute `event: "*"` (donc INSERT, UPDATE, DELETE) et gère correctement le payload d'un UPDATE.

## 6. TABLETTE VS TÉLÉPHONE

**Le téléphone du serveur se met à jour immédiatement car :**
La fonction `updateTable` utilise un *Optimistic Update*. Elle modifie l'état de l'écran du serveur instantanément avant même que Supabase ne réponde. Le serveur n'attend pas Realtime pour voir son propre changement.

**La tablette du caissier ne se met pas à jour car :**
Le flux s'arrête au niveau de la **Subscription Realtime** ou du **Serveur Supabase**.
Soit Supabase n'envoie jamais l'événement, soit la tablette ne l'écoute plus. (Voir section Diagnostics).

## 7. AUTHENTIFICATION ET RLS

Si le caissier parvient à afficher les tables lorsqu'il ouvre l'application ou rafraîchit la page, c'est que la politique `SELECT` sur `tables` est valide pour son rôle.
L'accès au flux Realtime respecte les politiques `SELECT`. Le RLS ne bloque donc probablement pas la réception des événements s'il ne bloque pas la requête initiale.

## 8. CACHE ET STATE MANAGEMENT

* **Mécanisme** : **Zustand** gère l'état global (`useTableGlobalState`).
* Zustand est totalement réactif.
* **Pas de blocage dû au cache** : Si le callback Realtime s'exécute, Zustand notifiera `TablesPage` qui se mettra à jour. L'absence de mise à jour prouve que le callback Realtime (`postgres_changes`) n'est jamais déclenché sur la tablette du caissier.

## 9. CAPACITOR / ANDROID (Facteur Critique)

L'impact du cycle de vie Android est **majeur** ici :
Lorsque la tablette du caissier s'éteint (mise en veille de l'écran pour économiser la batterie) ou passe en background, Android suspend les connexions WebSocket.
* Dans `tableStore.ts`, le code gère l'erreur de canal :
  ```typescript
  .subscribe((status, err) => {
    if (status === "CHANNEL_ERROR" || status === "CLOSED") {
      _initialized = false;
    }
  });
  ```
* **LE PROBLÈME :** L'application met la variable à `false`, **mais n'essaie jamais de se reconnecter**. La fonction d'initialisation `_initTableSync()` n'est appelée qu'une seule fois au montage de la racine (`__root.tsx`). Lorsque la tablette se réveille, le WebSocket est mort, et l'app ne le recrée pas.

## 10. SUBSCRIPTIONS MULTIPLES

* Pas de risque majeur de subscriptions multiples car le code utilise un flag singleton `let _initialized = false`.
* En revanche, il y a une fuite de mémoire technique car les channels ne sont jamais supprimés via `supabase.removeChannel()` si le composant venait à être démonté.

## 11. TEST DU FLUX COMPLET

1 à 5 : Fonctionnent (le serveur crée la commande, Supabase l'enregistre).
6. **Supabase reçoit la modification** : Réussite.
7. **Realtime doit envoyer l'événement** : *Échec potentiel* (Si la publication Realtime n'est pas activée en base de données).
8. **La tablette doit recevoir l'événement** : **Échec certain** après une mise en veille. Le WebSocket est en statut `CLOSED` et aucune reconnexion automatique n'est implémentée.

## 12. SCÉNARIO INVERSE

*(Caissier libère Table 5 -> Téléphone du serveur)*
Ce scénario échouera exactement pour les mêmes raisons. Le téléphone du serveur subira la même déconnexion de WebSocket d'Android (Capacitor) s'il se met en veille dans la poche du serveur.

## 13. CAUSES POSSIBLES

### CERTAIN : Absence de reconnexion Realtime après une veille (Android)
* **Fichier** : `src/lib/tableStore.ts` (lignes 168-174) & `src/lib/tableOrdersStore.ts` (lignes 185-191)
* **Explication** : Lors d'une perte réseau ou d'une mise en veille, la connexion passe en `CHANNEL_ERROR`. Le code remet `_initialized = false` mais ne déclenche aucune logique de reconnexion. La racine React n'étant pas remontée, le WebSocket reste définitivement inactif.
* **Impact** : L'appareil ne reçoit plus aucune mise à jour dès la première mise en veille de l'écran.

### PROBABLE : Realtime non activé sur la table "tables" dans Supabase
* **Explication** : Sur Supabase, par défaut, les tables ne diffusent pas les événements Realtime pour des raisons de performance. Si vous n'avez pas explicitement activé la table `tables` dans les paramètres de la base de données (Publication `supabase_realtime` + Replica Identity), aucun appareil ne recevra jamais d'événement.
* **Preuve** : C'est le comportement classique de la plateforme. La vue locale du téléphone change à cause du cache Zustand, masquant le fait que Realtime est inactif.

---

# DIAGNOSTIC FINAL

### Cause principale
Le problème provient d'une **rupture silencieuse de la connexion WebSocket (Realtime) causée par le cycle de vie Android**. Lorsque la tablette ou le téléphone s'éteint pour préserver sa batterie, l'OS coupe la connexion. L'application intercepte bien cette erreur (`CHANNEL_ERROR`) et passe un drapeau interne (`_initialized`) à `false`, mais **elle ne lance aucune instruction pour recréer le canal**. L'interface reste figée dans le temps jusqu'à un rafraîchissement manuel de l'application.

### Causes secondaires
Il est **fortement probable** que la diffusion Realtime ne soit pas activée pour la table `tables` au niveau du panneau de contrôle Supabase (Replica Identity). Si c'est le cas, même sans mise en veille, la tablette ne recevrait aucune donnée.

### Fichiers concernés
* `src/lib/tableStore.ts`
* `src/lib/tableOrdersStore.ts`
* `src/routes/__root.tsx` (potentiellement, pour ajouter une gestion du cycle de vie Capacitor / Window Focus).

### Tables Supabase concernées
* `tables`
* `table_orders`

### Realtime concerné
Les abonnements `"tables-rooms-realtime"` et `"table-orders-realtime"` cessent de fonctionner de manière définitive après une erreur de canal.

### RLS concerné
Aucune politique ne pose problème dans la mesure où les données initiales sont bien reçues par la tablette.

### Correction recommandée
1. **Base de données** : Vérifier sur le Dashboard Supabase (Database -> Replication) que les tables `tables` et `table_orders` ont l'option "Realtime" d'activée (Publication `supabase_realtime`).
2. **Code (Reconnexion automatique)** : Dans `tableStore.ts` et `tableOrdersStore.ts`, au lieu de simplement remettre `_initialized = false`, il faut implémenter une logique de reconnexion (par exemple un `setTimeout` qui rappelle `_initTableSync()` avec un *backoff* progressif).
3. **Capacitor Lifecycle** : Écouter l'événement Capacitor `App.addListener('appStateChange', ...)` pour détecter le moment où l'application sort de veille (Foreground) afin de forcer une nouvelle souscription au canal Realtime si celui-ci est tombé, et de faire un appel API pour rattraper les tables modifiées pendant la veille.

### Risques
Si la reconnexion est mal implémentée (ex: sans utiliser le statut ou le cycle de vie correctement), cela pourrait créer de multiples connexions WebSocket simultanées (fuites de mémoire) qui ralentiront l'appareil et satureront le serveur Supabase. Il faut bien s'assurer d'appeler `supabase.removeChannel()` avant de tenter une reconnexion.

---

# VÉRIFICATION ET PREUVE — 8 TESTS DE VALIDATION

---

## TEST 1 — Realtime avec deux appareils actifs (aucune veille)

**Scénario :** Téléphone serveur ouvert + tablette caissier ouverte, aucun n'a jamais été mis en veille. Le serveur crée une commande pour Table 5.

**Analyse du code :**

1. Le serveur appelle `handleValidateOrder()` dans `TableOrderSidebar.tsx` (ligne 456).
2. `updateTable()` est appelé depuis `tableStore.ts` (ligne 219).
3. L'optimistic update (ligne 221) met à jour **uniquement** le Zustand local du téléphone — la tablette ne voit rien à ce stade.
4. La requête SQL est envoyée : `supabase.from("tables").update(payload).eq("id", id)` (ligne 237).
5. Supabase doit alors notifier le canal `"tables-rooms-realtime"` souscrit sur la tablette.

**Ce qui devrait se passer sur la tablette :**
Si Realtime est configuré, le callback en ligne 142 de `tableStore.ts` reçoit le payload, appelle `store.setTables(...)` (ligne 160), et Zustand notifie `TablesPage` qui se re-rend.

**Peut-il échouer même sans veille ?**

**OUI.** Il existe au moins une condition qui peut faire échouer ce scénario même avec les deux appareils actifs en permanence :

La connexion WebSocket Supabase Realtime peut rencontrer un `CHANNEL_ERROR` ou `TIMED_OUT` pour des raisons réseau transitoires (instabilité Wi-Fi, coupure momentanée, renouvellement DHCP, timeout du serveur). Dans ce cas, le callback `.subscribe()` déclenche uniquement `_initialized = false` (ligne 172) — **sans aucune tentative de reconnexion**.

L'`useEffect(() => {...}, [])` dans `__root.tsx` ne s'exécute qu'une seule fois au montage. Il ne se relancera jamais pour rappeler `_initTableSync()`.

**Preuves dans le code :**

```typescript
// __root.tsx — lignes 132-133
useTableSync();
useTableOrdersSync();
// ← appelés UNE SEULE FOIS au montage de RootComponent via useEffect(fn, [])
```

```typescript
// tableStore.ts — lignes 168-174
.subscribe((status, err) => {
  if (status === "CHANNEL_ERROR" || status === "CLOSED") {
    _initialized = false;  // ← flag remis à false...
    // ...mais RIEN ne rappelle _initTableSync()
  }
});
```

**Conclusion TEST 1 :**
Même sans mise en veille, une erreur réseau transitoire casse la souscription de façon permanente. Aucun mécanisme ne relance le canal. La tablette reste silencieuse jusqu'au prochain redémarrage de l'application.

---

## TEST 2 — Vérification de la configuration Supabase

**Recherche effectuée :** Tous les fichiers `.sql`, `.json`, `.ts`, `.env` du projet ont été inspectés pour trouver une mention de `supabase_realtime`, `REPLICA IDENTITY`, ou une migration SQL.

**Résultats :**
- Dossier `supabase/migrations/` : **absent**.
- Fichier de configuration Supabase côté DB : **absent**.
- Mention de `supabase_realtime` dans le code : **aucune**.

> **IMPOSSIBLE À VÉRIFIER DEPUIS LE CODE — vérification nécessaire dans le Supabase Dashboard.**

**Ce qui est connu depuis le code :**
La syntaxe utilisée dans `tableStore.ts` est correcte pour Supabase Realtime v2. Cependant, pour que `postgres_changes` fonctionne, la table doit être ajoutée à la **publication `supabase_realtime`** et avoir un `REPLICA IDENTITY` configuré. Ces deux paramètres ne sont pas configurables depuis le code applicatif.

**Vérification manuelle requise :**
1. Dashboard Supabase → **Database → Replication**.
2. Vérifier que les tables `tables` et `table_orders` ont le toggle Realtime **activé**.
3. Si elles sont absentes de la liste, les activer (opération non destructive).

---

## TEST 3 — Vérification du statut du channel

**Statuts possibles d'un channel Supabase Realtime :**

| Statut | Signification |
|---|---|
| `SUBSCRIBED` | WebSocket établi, écoute active et opérationnelle |
| `CHANNEL_ERROR` | Erreur lors de la souscription (réseau, RLS, configuration DB) |
| `TIMED_OUT` | Le délai d'attente de souscription a expiré sans réponse |
| `CLOSED` | Canal fermé (perte de connexion ou fermeture volontaire) |

**Traitement actuel dans le code :**

```typescript
// tableStore.ts — lignes 168-174
.subscribe((status, err) => {
  if (status === "CHANNEL_ERROR" || status === "CLOSED") {
    console.error("[tables-rooms] Realtime channel error:", status, err);
    _initialized = false;
  }
});
```

**Analyse :**

- ✅ `CHANNEL_ERROR` → traité (`_initialized = false`)
- ✅ `CLOSED` → traité (`_initialized = false`)
- ❌ `TIMED_OUT` → **non traité**. `_initialized` reste `true` mais le channel est mort.
- ❌ `SUBSCRIBED` → ni loggué ni utilisé pour confirmer l'état opérationnel ou resynchroniser.

**Impact critique du `TIMED_OUT` non traité :**

Si `TIMED_OUT` survient :
1. `_initialized` reste `true`.
2. Le canal est inactif.
3. Si `useTableSync()` est rappelé, le guard `if (_initialized) return;` (ligne 116) bloque toute réinitialisation.
4. **L'application croit être abonnée alors qu'elle ne l'est plus.**

Ce même bug existe dans `tableOrdersStore.ts` (lignes 185-191), sans traitement du `TIMED_OUT`.

---

## TEST 4 — Reconnexion

**Question :** Existe-t-il dans le projet une logique qui rappelle `_initTableSync()` après `CHANNEL_ERROR`, `CLOSED`, `TIMED_OUT`, une perte réseau, un retour au premier plan ou un changement de connexion Internet ?

**Recherche exhaustive effectuée sur l'ensemble du projet :**

| Mécanisme de reconnexion | Présent dans le code |
|---|---|
| Retry après `CHANNEL_ERROR` | **NON** |
| Retry après `CLOSED` | **NON** |
| Retry après `TIMED_OUT` | **NON** |
| `document.addEventListener('visibilitychange', ...)` | **NON** |
| `window.addEventListener('online', ...)` | **NON** |
| `App.addListener('appStateChange', ...)` | **NON** |
| `window.addEventListener('focus', ...)` | **NON** |
| Timer de polling de secours (setInterval) | **NON** |

**Fichiers confirmant l'absence totale de reconnexion :**
- `src/lib/tableStore.ts` → le `.subscribe()` remet `_initialized = false` sans rien déclencher.
- `src/lib/tableOrdersStore.ts` → comportement identique.
- `src/routes/__root.tsx` → `useEffect(() => {...}, [])` ne se relance jamais.
- Aucun autre fichier de `src/lib/` ou `src/routes/` ne contient de logique de reconnexion.

**Conclusion TEST 4 :**
Il n'existe **aucune logique de reconnexion** dans le projet. Une fois le canal tombé, pour quelque raison que ce soit, la souscription est morte jusqu'au prochain démarrage manuel de l'application.

---

## TEST 5 — Lifecycle Capacitor

**Le package `@capacitor/app` est-il installé ?**

```json
// package.json — dépendances Capacitor présentes :
"@capacitor/android": "^8.5.0",
"@capacitor/core":    "^8.5.0",
"@capacitor/cli":     "^8.5.0"
// "@capacitor/app"  → ABSENT
```

**Utilisation de `App.addListener` dans le code :**
Recherche sur tout le projet : **aucune occurrence trouvée** (seule mention : le fichier `REALTIME_TABLE_AUDIT.md` lui-même).

**Configuration Capacitor :**
```typescript
// capacitor.config.ts
server: {
  url: 'https://vida-food-caisse.vercel.app/'
}
```
L'application charge l'URL distante de Vercel. La WebView Android ne recharge pas la page lors du retour au premier plan — elle reprend exactement son état précédent, WebSocket mort inclus.

**Flux Android lors d'une veille :**
1. Ouverture app → WebSocket Realtime établi.
2. Verrouillage écran / passage en background → Android suspend la WebView → WebSocket coupé.
3. Retour au premier plan → WebView reprend son état → WebSocket toujours mort.
4. Aucun listener ne détecte ce retour → aucune reconnexion.

**Conclusion TEST 5 :**
Le plugin `@capacitor/app` n'est pas installé. Aucun listener de cycle de vie n'existe. Chaque mise en veille ou passage en background laisse les channels Realtime dans un état définitivement mort, sans aucune possibilité de récupération automatique.

---

## TEST 6 — Vérification CRITIQUE

**Question :** Si le téléphone serveur et la tablette caissier sont tous les deux ouverts, actifs, connectés à Internet et n'ont jamais été mis en veille, le code actuel **garantit-il** que la tablette reçoive l'événement Realtime lorsque le serveur fait un UPDATE sur `tables` ?

### NON

**Raisons prouvées par le code :**

**Raison 1 — Configuration Supabase (externe au code) :**
Si la table `tables` n'est pas dans la publication `supabase_realtime`, Supabase n'émet aucun événement. Cela ne peut pas être garanti depuis le code applicatif.

**Raison 2 — Statut `TIMED_OUT` non géré (prouvé dans `tableStore.ts`) :**
Un `TIMED_OUT` peut survenir en session active. Il laisse `_initialized = true` et le canal silencieux, avec le guard qui bloque tout réessai :
```typescript
// tableStore.ts — ligne 116
if (_initialized) return;
```

**Raison 3 — Commentaire aveu dans le code lui-même :**
```typescript
// tableStore.ts — lignes 244-245
// We rely on the Supabase Realtime subscription to reload the data eventually,
// or the optimistic state will persist until refresh.
```
Ce commentaire reconnaît explicitement que si Realtime ne fonctionne pas, l'état optimiste local du serveur ne se propagera pas — et que la tablette ne se mettra pas à jour.

---

## TEST 7 — Détermination de la vraie cause

**Catégorie : G — Plusieurs causes combinées**

| Catégorie | Statut | Justification |
|---|---|---|
| A — Configuration Supabase | **Non vérifiable** | Aucune migration ni config DB dans le projet |
| B — Subscription frontend | **CERTAINE** | `TIMED_OUT` non géré ; `_initialized` bloque le réessai |
| C — State Zustand | **Hors de cause** | Zustand fonctionne correctement si le callback Realtime est appelé |
| D — RLS | **Hors de cause** | Le SELECT initial fonctionne, donc les droits de lecture sont corrects |
| E — Capacitor/Android lifecycle | **CERTAINE** | `@capacitor/app` absent ; aucun listener lifecycle |
| F — Reconnexion | **CERTAINE** | Aucune logique de reconnexion dans tout le projet |

**Synthèse :**
La cause est **B + E + F combinés**. La cause **A** peut être un prérequis manquant qui rend le problème total dès le démarrage, avant même que les autres causes ne se manifestent.

---

## TEST 8 — Plan de correction minimal

> Ce plan est descriptif uniquement. Aucun fichier n'est modifié.

### Prérequis — Vérification Supabase Dashboard (zéro modification de code)

Avant toute modification de code, effectuer dans le Dashboard Supabase :
1. **Database → Replication** : activer les tables `tables` et `table_orders` dans la publication `supabase_realtime`.
2. Vérifier que `REPLICA IDENTITY` est à `DEFAULT` (valeur par défaut, suffisante pour les UPDATE).

Sans cette étape, aucune correction de code ne sera efficace.

---

### Fichiers à modifier

| Fichier | Modification |
|---|---|
| `package.json` | Ajouter `@capacitor/app` |
| `src/lib/tableStore.ts` | Refactoriser `_initTableSync()` |
| `src/lib/tableOrdersStore.ts` | Même refactorisation |
| `src/routes/__root.tsx` | Ajouter listener Capacitor lifecycle |

---

### Fichiers à NE PAS modifier

| Fichier | Raison |
|---|---|
| `src/routes/tables.tsx` | Ne concerne pas la couche Realtime |
| `src/components/pos/TableOrderSidebar.tsx` | La logique de commande est correcte |
| `src/lib/supabase.ts` | Le client est correctement configuré |
| `capacitor.config.ts` | La configuration serveur est correcte |

---

### Logique à AJOUTER dans `tableStore.ts`

```
// pseudo-code — ne pas copier tel quel

let _channel: RealtimeChannel | null = null;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _retryDelay = 2000; // commence à 2 secondes

function _scheduleRetry() {
  if (_retryTimer) clearTimeout(_retryTimer);
  _retryTimer = setTimeout(() => {
    _retryDelay = Math.min(_retryDelay * 2, 30000); // back-off : 2s, 4s, 8s... max 30s
    _initTableSync();
  }, _retryDelay);
}

async function _initTableSync() {
  if (_initialized) return;

  // Nettoyage de l'ancien channel avant tout
  if (_channel) {
    await supabase.removeChannel(_channel);
    _channel = null;
  }

  try {
    await reloadTableStore(true);
  } catch {
    _scheduleRetry();
    return;
  }

  _initialized = true;
  _retryDelay = 2000; // réinitialiser le back-off après succès

  _channel = supabase
    .channel("tables-rooms-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, handleRoomChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "tables" }, handleTableChange)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // Resynchroniser pour rattraper les événements manqués pendant la déconnexion
        reloadTableStore();
      }
      if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
        _initialized = false;
        _scheduleRetry(); // ← la différence clé avec le code actuel
      }
    });
}
```

### Logique à AJOUTER dans `__root.tsx`

```
// pseudo-code — ne pas copier tel quel

import { App } from '@capacitor/app';

useEffect(() => {
  let listener: PluginListenerHandle;

  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      // Retour au premier plan : forcer la resynchronisation
      _initTableSync();
      _initTableOrdersSync();
    }
  }).then(handle => { listener = handle; });

  return () => {
    listener?.remove();
  };
}, []);
```

### Comment garantir un état cohérent entre téléphone et tablette

À chaque reconnexion réussie (`SUBSCRIBED`), un appel à `reloadTableStore()` re-fetche les données fraîches depuis Supabase. Cela garantit que les données manquées pendant la déconnexion sont récupérées et que les deux appareils affichent le même état.

**Flux corrigé :**
```
Déconnexion WebSocket (veille, erreur réseau, timeout)
  → Statut CHANNEL_ERROR / CLOSED / TIMED_OUT détecté
  → _initialized = false
  → removeChannel() sur l'ancien channel
  → scheduleRetry() avec back-off progressif (2s → 4s → ... → 30s max)
  → Reconnexion réussie → SUBSCRIBED
  → reloadTableStore() → données fraîches depuis Supabase
  → Zustand mis à jour
  → Tous les composants se re-rendent
  → État cohérent sur tous les appareils
```

### Risques si la correction est mal implémentée

1. **Subscriptions multiples** → si `removeChannel()` n'est pas appelé avant de recréer le canal, plusieurs canaux coexistent, chaque événement arrive plusieurs fois, et l'UI tressaute.
2. **Boucle infinie de retry** → si le back-off n'est pas respecté ou si le timer n'est pas annulé avant le retry, l'app peut saturer Supabase avec des reconnexions.
3. **Race condition** → si `reloadTableStore()` est appelé pendant qu'un événement Realtime arrive, les deux mises à jour Zustand peuvent s'écraser mutuellement. À gérer avec un flag de chargement.
4. **Fuite du listener Capacitor** → si `App.removeAllListeners()` n'est pas appelé au démontage, le listener s'accumule à chaque remontage du composant racine.

