import React, { createContext, useContext, useCallback, useState } from 'react';
import { useWebSocket, WebSocketMessage, WebSocketHookReturn } from '../hooks/useWebSocket';
import { SessionStatus, JobStatus } from '@sps/shared-types';

export interface SessionStatusUpdate {
  status: SessionStatus;
  timestamp: string;
}

export interface PrintStatusUpdate {
  jobId: string;
  status: JobStatus;
  progress?: number;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface PrinterStatusUpdate {
  status: any;
  timestamp: string;
}

export interface WebSocketContextValue extends WebSocketHookReturn {
  sessionStatus: SessionStatusUpdate | null;
  printStatus: PrintStatusUpdate | null;
  printerStatus: PrinterStatusUpdate | null;
  errorMessage: string | null;
  clearError: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export interface WebSocketProviderProps {
  children: React.ReactNode;
  sessionId?: string;
}

/**
 * WebSocket context provider for managing real-time communication
 * Requirements: 6.3, 6.4 - Real-time session status updates and print progress broadcasting
 */
export function WebSocketProvider({ children, sessionId }: WebSocketProviderProps) {
  const [sessionStatus, setSessionStatus] = useState<SessionStatusUpdate | null>(null);
  const [printStatus, setPrintStatus] = useState<PrintStatusUpdate | null>(null);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatusUpdate | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    console.log('Received WebSocket message:', message);

    switch (message.type) {
      case 'session-status-update':
        setSessionStatus({
          status: message.data?.status,
          timestamp: message.timestamp || new Date().toISOString()
        });
        break;

      case 'print-status-update':
        setPrintStatus({
          jobId: message.jobId || '',
          status: message.data?.status,
          progress: message.data?.progress,
          message: message.data?.message,
          error: message.data?.error,
          timestamp: message.timestamp || new Date().toISOString()
        });
        break;

      case 'printer-status-update':
        setPrinterStatus({
          status: message.data,
          timestamp: message.timestamp || new Date().toISOString()
        });
        break;

      case 'error':
        setErrorMessage(message.data?.error || 'Unknown error occurred');
        break;

      case 'session-ended':
        setSessionStatus({
          status: SessionStatus.TERMINATED,
          timestamp: message.timestamp || new Date().toISOString()
        });
        break;

      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  }, []);

  const handleError = useCallback((error: Event) => {
    console.error('WebSocket error:', error);
    setErrorMessage('Connection error occurred. Attempting to reconnect...');
  }, []);

  const handleConnect = useCallback(() => {
    console.log('WebSocket connected');
    setErrorMessage(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log('WebSocket disconnected');
    setErrorMessage('Connection lost. Attempting to reconnect...');
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  // Get WebSocket URL from current location
  const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}`;
  };

  const webSocket = useWebSocket({
    url: getWebSocketUrl(),
    sessionId,
    onMessage: handleMessage,
    onError: handleError,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10
  });

  const contextValue: WebSocketContextValue = {
    ...webSocket,
    sessionStatus,
    printStatus,
    printerStatus,
    errorMessage,
    clearError
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}