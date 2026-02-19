import React from 'react';
import { Routes, Route } from 'react-router-dom';
import SessionPageWrapper from './pages/SessionPageWrapper';
import HomePage from './pages/HomePage';

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/session/:sessionId" element={<SessionPageWrapper />} />
      </Routes>
    </div>
  );
}

export default App;