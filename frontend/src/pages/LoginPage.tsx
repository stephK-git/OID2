import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/client';
import { SiteHeader } from '../components/site';

interface LoginResponse {
  access_token: string;
  role: string;
  nom: string;
}

type RoleKey = 'coordinateur' | 'verificateur' | 'enqueteur';

interface RoleConfig {
  key: RoleKey;
  name: string;
  title: string;
  sub: string;
  email: string;
  pass: string;
  icon: string;
  colorClass: string;
  btnText: string;
}

const ROLE_CONFIGS: Record<RoleKey, RoleConfig> = {
  coordinateur: {
    key: 'coordinateur',
    name: 'COORDINATEUR',
    title: 'Coordinateur',
    sub: 'Poste HQ',
    email: 'coordinateur@oid.demo',
    pass: 'demo1234',
    icon: 'shield',
    colorClass: 'text-sky',
    btnText: 'Accéder au Poste de Commandement HQ',
  },
  verificateur: {
    key: 'verificateur',
    name: 'VÉRIFICATEUR',
    title: 'Vérificateur',
    sub: 'Triage Crise',
    email: 'verificateur@oid.demo',
    pass: 'demo1234',
    icon: 'fact_check',
    colorClass: 'text-amber',
    btnText: 'Accéder à la Salle de Triage & Qualification',
  },
  enqueteur: {
    key: 'enqueteur',
    name: 'ENQUÊTEUR',
    title: 'Enquêteur',
    sub: 'Terrain WGS84',
    email: 'enqueteur@oid.demo',
    pass: 'demo1234',
    icon: 'directions_run',
    colorClass: 'text-mint',
    btnText: "Accéder au Terminal d'Évaluation Terrain",
  },
};

export const LoginPage: React.FC = () => {
  const [activeRole, setActiveRole] = useState<RoleKey>('coordinateur');
  const [email, setEmail] = useState('coordinateur@oid.demo');
  const [password, setPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user, login } = useAuth();
  const navigate = useNavigate();

  // Si l'utilisateur est déjà connecté, le rediriger directement vers sa section
  useEffect(() => {
    if (user) {
      if (user.role === 'coordinateur') {
        navigate('/coordination', { replace: true });
      } else if (user.role === 'verificateur') {
        navigate('/verification', { replace: true });
      } else if (user.role === 'enqueteur') {
        navigate('/enquete', { replace: true });
      }
    }
  }, [user, navigate]);

  const handleSelectRole = (key: RoleKey) => {
    setActiveRole(key);
    setEmail(ROLE_CONFIGS[key].email);
    setPassword(ROLE_CONFIGS[key].pass);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      login(res.access_token, { nom: res.nom, role: res.role });

      // Redirection automatique selon le rôle retourné
      if (res.role === 'coordinateur') {
        navigate('/coordination', { replace: true });
      } else if (res.role === 'verificateur') {
        navigate('/verification', { replace: true });
      } else if (res.role === 'enqueteur') {
        navigate('/enquete', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      setError(
        err.message ||
          'Identifiants invalides.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="oid-auth-shell">
      {/* Top Security Header Bar */}
      <SiteHeader variant="auth" />

      {/* Main Form Center Area */}
      <main className="auth-main-area">
        <div className="auth-center-wrap">
          {/* Operational Auth Card */}
          <div className="auth-hq-card">
            <div className="auth-glow-accent" />

            <div className="auth-card-head">
              <h1>Connexion</h1>
              <p>Espace réservé aux équipes OID.</p>
            </div>

            {/* Quick Role Presets (Cartes interactives HQ) */}
            <div className="role-presets-block">
              <div className="role-presets-grid">
                {(Object.keys(ROLE_CONFIGS) as RoleKey[]).map((key) => {
                  const cfg = ROLE_CONFIGS[key];
                  const isActive = activeRole === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectRole(key)}
                      className={`role-preset-btn ${isActive ? 'active' : ''}`}
                    >
                      <div className="role-preset-top">
                        <span
                          className={`material-symbols-outlined ${
                            key === 'coordinateur'
                              ? 'text-sky'
                              : key === 'verificateur'
                              ? 'text-amber'
                              : 'text-mint'
                          }`}
                          style={{ fontSize: '20px' }}
                        >
                          {cfg.icon}
                        </span>
                        {isActive && <span className="role-preset-dot" />}
                      </div>
                      <div className="role-preset-title">{cfg.title}</div>
                      <div className="role-preset-sub">{cfg.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="auth-form-body">
              {error && (
                <div className="auth-error-banner" role="alert">
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    warning
                  </span>
                  <span>{error}</span>
                </div>
              )}

              <div className="auth-field">
                <label className="auth-field-lbl" htmlFor="auth-email">
                  <span>E-mail</span>
                </label>
                <div className="auth-input-box">
                  <span className="material-symbols-outlined icon-left">mail</span>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="agent@oid.demo"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="auth-field">
                <div className="auth-field-lbl">
                  <label htmlFor="auth-password">Mot de passe</label>
                </div>
                <div className="auth-input-box">
                  <span className="material-symbols-outlined icon-left">lock</span>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="auth-eye-btn"
                    title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="auth-submit-btn"
              >
                <span
                  className={`material-symbols-outlined ${loading ? 'spin' : ''}`}
                  style={{ fontSize: '20px' }}
                >
                  {loading ? 'refresh' : 'login'}
                </span>
                <span>
                  {loading ? 'Connexion...' : 'Se connecter'}
                </span>
              </button>
            </form>
          </div>

          <p className="auth-citizen-line">
            Témoin d'une inondation ? <Link to="/signaler">Signaler un sinistre</Link>
          </p>
        </div>
      </main>
    </div>
  );
};
