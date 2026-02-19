import React, { useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import SessionPageWrapper from './pages/SessionPageWrapper';

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<RedirectToSession />} />
        <Route path="/session/:sessionId" element={<SessionPageWrapper />} />
      </Routes>
    </div>
  );
}

// Component to auto-create session and redirect
function RedirectToSession() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    createSessionAndRedirect();
  }, []);

  const createSessionAndRedirect = async () => {
    try {
      // Create a new session with WebSocket token
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
      const sessionId = data.sessionId;
      const token = data.token; // WebSocket security token

      // Store token in sessionStorage for WebSocket authentication
      if (token) {
        sessionStorage.setItem(`ws_token_${sessionId}`, token);
      }

      // Redirect to session page
      navigate(`/session/${sessionId}`, { replace: true });
    } catch (error) {
      console.error('Error creating session:', error);
      // Show error message
      document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: system-ui; padding: 20px; text-align: center;">
          <h1 style="color: #ef4444; margin-bottom: 16px;">Connection Error</h1>
          <p style="color: #666; margin-bottom: 24px;">Unable to connect to print service</p>
          <button onclick="window.location.reload()" style="background: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer;">
            Retry
          </button>
        </div>
      `;
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
        <h2 style={{ color: '#1a1a1a', marginBottom: '8px' }}>Connecting...</h2>
        <p style={{ color: '#666' }}>Setting up your print session</p>
      </div>
    </div>
  );
}

export default App;