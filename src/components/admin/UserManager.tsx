import { useEffect, useState } from "react";
import {
  UserPlus, Trash2, Eye, EyeOff, Users, ShieldCheck,
  CassetteTape, Loader2, AlertCircle, CheckCircle2
} from "lucide-react";
import { useUsersStore, type UserRole } from "@/lib/authStore";

const ROLE_LABELS: Record<UserRole, string> = {
  caisse: "Caisse",
  serveur: "Serveur",
};

const ROLE_COLORS: Record<UserRole, { badge: string; dot: string }> = {
  caisse:  { badge: "bg-primary/10 text-primary border-primary/20",    dot: "bg-primary"   },
  serveur: { badge: "bg-violet-100 text-violet-700 border-violet-200", dot: "bg-violet-500" },
};

export function UserManager() {
  const { users, loading, fetchUsers, addUser, deleteUser } = useUsersStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<UserRole>("caisse");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { fetchUsers(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSuccessMsg("");
    setSubmitting(true);
    const result = await addUser(username, password, role);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error ?? "Erreur inconnue.");
    } else {
      setSuccessMsg(`Utilisateur « ${username.trim()} » créé.`);
      setUsername("");
      setPassword("");
    }
  }

  async function handleDelete(id: string, uname: string) {
    if (!confirm(`Supprimer l'utilisateur « ${uname} » ?`)) return;
    setDeletingId(id);
    await deleteUser(id);
    setDeletingId(null);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 md:p-6">

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary">
          <Users className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Gestion des utilisateurs</h2>
          <p className="text-xs text-muted-foreground">Créez les comptes pour la caisse et les serveurs</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">

        {/* ── ADD USER FORM ── */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col gap-4 h-fit">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-primary" />
            Ajouter un utilisateur
          </div>

          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            {/* Username */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nom d'utilisateur
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setFormError(""); setSuccessMsg(""); }}
                placeholder="ex: marie.caisse"
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-0 transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                required
                autoComplete="off"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFormError(""); setSuccessMsg(""); }}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm outline-none ring-0 transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Role */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rôle
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["caisse", "serveur"] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-semibold transition-all ${
                      role === r
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {r === "caisse" ? <ShieldCheck className="h-4 w-4" /> : <CassetteTape className="h-4 w-4" />}
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* Error / success */}
            {formError && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs font-medium text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {formError}
              </div>
            )}
            {successMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-3 py-2 text-xs font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {successMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {submitting ? "Création…" : "Créer l'utilisateur"}
            </button>
          </form>
        </div>

        {/* ── USER LIST ── */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" />
              Utilisateurs ({users.length})
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
            {!loading && users.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
                <Users className="h-10 w-10 opacity-20" />
                <p className="text-sm">Aucun utilisateur pour l'instant.<br />Créez le premier compte ci-contre.</p>
              </div>
            )}

            {users.map((user) => {
              const colors = ROLE_COLORS[user.role];
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition hover:bg-muted/40"
                >
                  {/* Avatar */}
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold uppercase text-muted-foreground">
                    {user.username.substring(0, 2)}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{user.username}</p>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${colors.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                      {ROLE_LABELS[user.role]}
                    </span>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(user.id, user.username)}
                    disabled={deletingId === user.id}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive active:scale-95 disabled:opacity-40"
                    title="Supprimer"
                  >
                    {deletingId === user.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />
                    }
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
