import React from 'react';

export const EmergencyBanner: React.FC = () => {
  return (
    <div className="emergency-banner" role="alert">
      <div className="emergency-banner-content">
        <div className="emergency-banner-text">
          <span className="material-symbols-outlined emergency-icon" style={{ fontSize: '18px' }}>
            emergency
          </span>
          <span>
            <strong>Urgence vitale immédiate :</strong> contactez directement les secours avant tout signalement
          </span>
        </div>
        <div className="emergency-numbers">
          <a href="tel:180" className="emergency-btn emergency-btn-gspm" title="Appeler le GSPM (Sapeurs-pompiers)">
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              call
            </span>
            <span>GSPM 180</span>
          </a>
          <a href="tel:112" className="emergency-btn emergency-btn-112" title="Appeler le numéro d'urgence 112">
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              shield
            </span>
            <span>112</span>
          </a>
        </div>
      </div>
    </div>
  );
};
