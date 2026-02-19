import React from 'react';
import { useParams } from 'react-router-dom';
import DemoSessionPage from './DemoSessionPage';

/**
 * Wrapper component for demo purposes - bypasses WebSocket and API calls
 */
function SessionPageWrapper() {
  const { sessionId } = useParams<{ sessionId: string }>();

  // Use demo version for now to bypass scanning phase
  return <DemoSessionPage />;
}

export default SessionPageWrapper;