// Build: 2026-02-27 15:12 - Force cache clear
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

// Component to auto-create session and redirect IMMEDIATELY
function RedirectToSession() {
  const navigate = useNavigate();

  useEffect(() => {
    // Generate session ID immediately on client side (no API call delay)
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('Auto-generated session:', sessionId);
    
    // Redirect IMMEDIATELY to session page
    navigate(`/session/${sessionId}`, { replace: true });
  }, [navigate]);

  // Show nothing while redirecting
  return null;
}

export default App;