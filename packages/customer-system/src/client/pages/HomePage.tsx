import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';

function HomePage() {
  const navigate = useNavigate();
  const [qrCode, setQrCode] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createSession();
  }, []);

  const createSession = async () => {
    try {
      setLoading(true);
      
      // Create a new session
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      const newSessionId = data.sessionId;
      setSessionId(newSessionId);

      // Generate QR code with session URL
      const sessionUrl = `${window.location.origin}/session/${newSessionId}`;
      const qrDataUrl = await QRCode.toDataURL(sessionUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      setQrCode(qrDataUrl);
      setLoading(false);
    } catch (error) {
      console.error('Error creating session:', error);
      setLoading(false);
    }
  };

  const handleStartPrinting = () => {
    if (sessionId) {
      navigate(`/session/${sessionId}`);
    }
  };

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <div className="logo">
          <div className="logo-icon">A</div>
          <span className="logo-text">ACCHU</span>
        </div>
        <button className="menu-button">
          <div className="menu-lines">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </button>
      </header>

      <div className="status-indicator">
        <div className="status-dot"></div>
        <span>READY TO PRINT</span>
      </div>

      <main className="scan-page">
        <h1 className="scan-title">SCAN NOW</h1>
        <p className="scan-subtitle">
          Position this code at the scanner of any<br />
          ACCHU-enabled kiosk.
        </p>

        <div className="qr-frame">
          <div className="qr-container">
            {loading ? (
              <div className="qr-placeholder">
                <div className="secure-access-card">
                  <div className="card-header">CREATING SESSION</div>
                  <div className="lock-icon">⏳</div>
                  <div className="card-footer">PLEASE WAIT</div>
                </div>
              </div>
            ) : qrCode ? (
              <img src={qrCode} alt="Session QR Code" className="qr-code-image" />
            ) : (
              <div className="qr-placeholder">
                <div className="secure-access-card">
                  <div className="card-header">ERROR</div>
                  <div className="lock-icon">❌</div>
                  <div className="card-footer">
                    <button onClick={createSession} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="action-buttons">
          <button className="action-btn share-btn" onClick={handleStartPrinting} disabled={!sessionId}>
            <div className="btn-icon">📄</div>
            <span>Start Printing</span>
          </button>
          <button className="action-btn history-btn" onClick={createSession}>
            <div className="btn-icon">⟲</div>
            <span>New Session</span>
          </button>
        </div>
      </main>

      <footer className="mobile-footer">
        <div className="system-status">
          <div className="status-dot green"></div>
          <span>SYSTEM OPERATIONAL</span>
        </div>
        <button className="theme-toggle">🌙</button>
      </footer>
    </div>
  );
}

export default HomePage;