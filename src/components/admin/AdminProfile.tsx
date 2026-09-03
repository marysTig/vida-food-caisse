import { useState, useEffect } from "react";
import { updateAdminCredentials, verifyAdminPassword, ADMIN_ROW_ID } from "@/lib/authStore";
import { supabase } from "@/lib/supabase";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";

export function AdminProfile() {
  // ── Fetch current admin username from Supabase (source of truth)
  const [adminUsername, setAdminUsername] = useState("");
  const [newUsername, setNewUsername]     = useState("");
  const [usernameLoaded, setUsernameLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("pos_users")
      .select("username")
      .eq("id", ADMIN_ROW_ID)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.username) {
          setAdminUsername(data.username);
          setNewUsername(data.username);
        }
        setUsernameLoaded(true);
      });
  }, []);

  // ── Username form
  const [usernameMsg, setUsernameMsg]       = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // ── Password form
  const [currentPwd,  setCurrentPwd]   = useState("");
  const [newPwd,      setNewPwd]        = useState("");
  const [confirmPwd,  setConfirmPwd]    = useState("");
  const [showCur,     setShowCur]       = useState(false);
  const [showNew,     setShowNew]       = useState(false);
  const [showCon,     setShowCon]       = useState(false);
  const [passwordMsg, setPasswordMsg]   = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // ── Handlers
  async function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newUsername.trim();
    if (!trimmed) {
      setUsernameMsg({ type: "err", text: "Le nom d'utilisateur ne peut pas être vide." });
      return;
    }
    setIsSavingUsername(true);
    try {
      const finalResult = await updateAdminCredentials({ username: trimmed });

      if (!finalResult.ok) {
        setUsernameMsg({ type: "err", text: finalResult.error ?? "Erreur lors de la sauvegarde." });
      } else {
        setAdminUsername(trimmed);
        setUsernameMsg({ type: "ok", text: "Nom d'utilisateur mis à jour avec succès." });
        setTimeout(() => setUsernameMsg(null), 3500);
      }
    } catch {
      setUsernameMsg({ type: "err", text: "Erreur réseau. Réessayez." });
    } finally {
      setIsSavingUsername(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();

    // Verify current password against Supabase (not localStorage)
    const isCurrentValid = await verifyAdminPassword(currentPwd);
    if (!isCurrentValid) {
      setPasswordMsg({ type: "err", text: "Le mot de passe actuel est incorrect." });
      return;
    }
    if (newPwd.length < 6) {
      setPasswordMsg({ type: "err", text: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPasswordMsg({ type: "err", text: "Les mots de passe ne correspondent pas." });
      return;
    }

    setIsSavingPassword(true);
    try {
      const result = await updateAdminCredentials({ password: newPwd });
      if (!result.ok) {
        setPasswordMsg({ type: "err", text: result.error ?? "Erreur lors de la sauvegarde." });
      } else {
        setCurrentPwd("");
        setNewPwd("");
        setConfirmPwd("");
        setPasswordMsg({ type: "ok", text: "Mot de passe mis à jour avec succès. Il est maintenant actif sur tous les appareils." });
        setTimeout(() => setPasswordMsg(null), 4000);
      }
    } catch {
      setPasswordMsg({ type: "err", text: "Erreur réseau. Réessayez." });
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <div className="admin-profile-root">
      {/* Page header */}
      <div className="admin-profile-header">
        <div className="admin-profile-avatar">
          <ShieldCheck className="admin-profile-avatar-icon" />
        </div>
        <div>
          <h2 className="admin-profile-name">{usernameLoaded ? adminUsername : "…"}</h2>
          <span className="admin-profile-role">Administrateur</span>
        </div>
      </div>

      <div className="admin-profile-cards">

        {/* ── Username card */}
        <div className="admin-profile-card">
          <div className="admin-profile-card-title">
            <User size={18} />
            Changer le nom d'utilisateur
          </div>

          <form onSubmit={handleSaveUsername} className="admin-profile-form">
            <div className="admin-profile-field">
              <label htmlFor="profile-username">Nouveau nom d'utilisateur</label>
              <div className="admin-profile-input-wrap">
                <User size={15} className="admin-profile-input-icon" />
                <input
                  id="profile-username"
                  type="text"
                  value={newUsername}
                  onChange={(e) => { setNewUsername(e.target.value); setUsernameMsg(null); }}
                  placeholder="ex: admin"
                  autoComplete="off"
                  disabled={!usernameLoaded}
                />
              </div>
            </div>

            {usernameMsg && (
              <div className={`admin-profile-msg ${usernameMsg.type === "ok" ? "admin-profile-msg-ok" : "admin-profile-msg-err"}`}>
                {usernameMsg.type === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {usernameMsg.text}
              </div>
            )}

            <button type="submit" className="admin-profile-btn" disabled={isSavingUsername || !usernameLoaded}>
              {isSavingUsername ? "Enregistrement…" : "Enregistrer le nom"}
            </button>
          </form>
        </div>

        {/* ── Password card */}
        <div className="admin-profile-card">
          <div className="admin-profile-card-title">
            <Lock size={18} />
            Changer le mot de passe
          </div>

          <form onSubmit={handleSavePassword} className="admin-profile-form">
            {/* Current */}
            <div className="admin-profile-field">
              <label htmlFor="profile-current-pwd">Mot de passe actuel</label>
              <div className="admin-profile-input-wrap">
                <Lock size={15} className="admin-profile-input-icon" />
                <input
                  id="profile-current-pwd"
                  type={showCur ? "text" : "password"}
                  value={currentPwd}
                  onChange={(e) => { setCurrentPwd(e.target.value); setPasswordMsg(null); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button type="button" className="admin-profile-eye" onClick={() => setShowCur((v) => !v)}>
                  {showCur ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New */}
            <div className="admin-profile-field">
              <label htmlFor="profile-new-pwd">Nouveau mot de passe</label>
              <div className="admin-profile-input-wrap">
                <Lock size={15} className="admin-profile-input-icon" />
                <input
                  id="profile-new-pwd"
                  type={showNew ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => { setNewPwd(e.target.value); setPasswordMsg(null); }}
                  placeholder="min. 6 caractères"
                  autoComplete="new-password"
                />
                <button type="button" className="admin-profile-eye" onClick={() => setShowNew((v) => !v)}>
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm */}
            <div className="admin-profile-field">
              <label htmlFor="profile-confirm-pwd">Confirmer le nouveau mot de passe</label>
              <div className="admin-profile-input-wrap">
                <Lock size={15} className="admin-profile-input-icon" />
                <input
                  id="profile-confirm-pwd"
                  type={showCon ? "text" : "password"}
                  value={confirmPwd}
                  onChange={(e) => { setConfirmPwd(e.target.value); setPasswordMsg(null); }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button type="button" className="admin-profile-eye" onClick={() => setShowCon((v) => !v)}>
                  {showCon ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {passwordMsg && (
              <div className={`admin-profile-msg ${passwordMsg.type === "ok" ? "admin-profile-msg-ok" : "admin-profile-msg-err"}`}>
                {passwordMsg.type === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {passwordMsg.text}
              </div>
            )}

            <button
              type="submit"
              className="admin-profile-btn"
              disabled={!currentPwd || !newPwd || !confirmPwd || isSavingPassword}
            >
              {isSavingPassword ? "Enregistrement…" : "Enregistrer le mot de passe"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
