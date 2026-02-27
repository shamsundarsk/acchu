import React from 'react';
import { useParams } from 'react-router-dom';
import SessionPage from './SessionPage';

/**
 * Wrapper component that loads the real SessionPage with all features
 */
function SessionPageWrapper() {
  const { sessionId } = useParams<{ sessionId: string }>();

  // Use the real SessionPage with all delete buttons and features
  return <SessionPage />;
}

export default SessionPageWrapper;