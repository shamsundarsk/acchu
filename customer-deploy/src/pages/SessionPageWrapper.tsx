import React from 'react';
import { useParams } from 'react-router-dom';
import { WebSocketProvider } from '../contexts/WebSocketContext';
import SessionPage from './SessionPage';

/**
 * Wrapper component that provides WebSocket context to SessionPage
 * Requirements: 6.3, 6.4 - Real-time session status updates and print progress broadcasting
 */
function SessionPageWrapper() {
  const { sessionId } = useParams<{ sessionId: string }>();

  return (
    <WebSocketProvider sessionId={sessionId}>
      <SessionPage />
    </WebSocketProvider>
  );
}

export default SessionPageWrapper;