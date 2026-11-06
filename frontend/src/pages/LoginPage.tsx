import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/client';
import { Lock, Mail, AlertCircle, LogIn, ShieldCheck } from 'lucide-react';

interface LoginResponse {
  access_token: string;
  role: string;
  nom: string;
}

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      login(res.access_token, { nom: res.nom, role: res.role });

      // Redirection automatique selon le rôle
      if (res.role === 'coordinateur') {
        navigate('/coordination');
      } else if (res.role === 'verificateur') {
        navigate('/verification');
      } else if (res.role === 'enqueteur') {
        navigate('/enquete');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Identifiants invalides ou compte inactif.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Demo1234!');
  };

  return (
    <div className="container page-content auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon-wrap">
            <ShieldCheck size={32} color="#0284c7" />
          </div>
          <h1>Connexion Professionnelle</h1>
          <p>Espace réservé aux agents de la régulation, vérificateurs et enquêteurs de terrain.</p>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Adresse E-mail</label>
            <div className="input-with-icon">
              <Mail size={18} className="input-icon" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@oid.org"
                className="form-control"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Mot de passe</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="form-control"
                required
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary btn-block">
            <LogIn size={18} />
            <span>{loading ? 'Connexion en cours...' : 'Se connecter'}</span>
          </button>
        </form>

        <div className="demo-accounts-box">
          <h4>Profils d'accès rapide :</h4>
          <div className="demo-tags">
            <button
              type="button"
              onClick={() => handleQuickFill('coordinateur@oid.org')}
              className="demo-tag"
            >
              Coordinateur
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('verificateur@oid.org')}
              className="demo-tag"
            >
              Vérificateur
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('enqueteur@oid.org')}
              className="demo-tag"
            >
              Enquêteur
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

