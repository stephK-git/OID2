import React from 'react';
import { AlertCircle, PhoneCall } from 'lucide-react';

export const EmergencyBanner: React.FC = () => {
  return (
    <div className="emergency-banner" role="alert">
      <div className="emergency-banner-content">
        <div className="emergency-banner-text">
          <AlertCircle size={18} className="emergency-icon" />
          <span>
            <strong>Ceci n'est pas un service d'urgence.</strong> En cas de péril immédiat, contactez les sapeurs-pompiers :
          </span>
        </div>
        <div className="emergency-numbers">
          <a href="tel:180" className="emergency-btn" title="Appeler les sapeurs-pompiers">
            <PhoneCall size={14} />
            <span>180</span>
          </a>
          <a href="tel:112" className="emergency-btn" title="Appeler le numéro d'urgence">
            <PhoneCall size={14} />
            <span>112</span>
          </a>
        </div>
      </div>
    </div>
  );
};

