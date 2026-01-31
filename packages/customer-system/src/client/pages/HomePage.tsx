import React from 'react';

function HomePage() {
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
            <div className="qr-placeholder">
              <div className="secure-access-card">
                <div className="card-header">SECURE ACCESS</div>
                <div className="lock-icon">🔒</div>
                <div className="card-footer">ACCHU</div>
              </div>
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button className="action-btn share-btn">
            <div className="btn-icon">↗</div>
            <span>Share Access</span>
          </button>
          <button className="action-btn history-btn">
            <div className="btn-icon">⟲</div>
            <span>Print History</span>
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