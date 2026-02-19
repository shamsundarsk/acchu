import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SessionPageWrapper from './pages/SessionPageWrapper';

// Demo Navigation Component
function DemoNavigation() {
  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      background: '#000', 
      color: '#fff', 
      padding: '8px 12px', 
      zIndex: 9999,
      fontSize: '11px',
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      alignItems: 'center'
    }}>
      <strong style={{ color: '#00ff00' }}>🚀 DEMO:</strong>
      <a href="/" style={{ color: '#fff', textDecoration: 'none' }}>Home</a>
      <span style={{ color: '#666' }}>|</span>
      <a href="/session/demo-upload" style={{ color: '#fff', textDecoration: 'none' }}>Upload</a>
      <span style={{ color: '#666' }}>|</span>
      <a href="/session/demo-config" style={{ color: '#fff', textDecoration: 'none' }}>Config</a>
      <span style={{ color: '#666' }}>|</span>
      <a href="/session/demo-print" style={{ color: '#fff', textDecoration: 'none' }}>Print</a>
      <span style={{ marginLeft: 'auto', color: '#666', fontSize: '10px' }}>
        ✅ Real uploads ✅ Working buttons ✅ No billing
      </span>
    </div>
  );
}

function App() {
  return (
    <div className="app">
      <DemoNavigation />
      <div style={{ paddingTop: '40px' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:sessionId" element={<SessionPageWrapper />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;