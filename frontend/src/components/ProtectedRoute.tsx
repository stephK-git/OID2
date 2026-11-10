import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactElement;
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirection automatique vers la section correspondant au rôle de l'utilisateur
    if (user.role === 'coordinateur') {
      return <Navigate to="/coordination" replace />;
    }
    if (user.role === 'verificateur') {
      return <Navigate to="/verification" replace />;
    }
    if (user.role === 'enqueteur') {
      return <Navigate to="/enquete" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
};

/**
 * Route réservée aux citoyens : bloque et redirige immédiatement les agents connectés
 * (coordonnateurs, vérificateurs, enquêteurs) vers leur espace opérationnel dédié.
 */
export const CitizenOnlyRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  if (isAuthenticated && user) {
    if (user.role === 'coordinateur') {
      return <Navigate to="/coordination" replace />;
    }
    if (user.role === 'verificateur') {
      return <Navigate to="/verification" replace />;
    }
    if (user.role === 'enqueteur') {
      return <Navigate to="/enquete" replace />;
    }
    return <Navigate to="/coordination" replace />;
  }

  return children;
};

