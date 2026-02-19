import { useEffect, useRef, useState, useCallback } from 'react';

export interface WebSocketMessage {
  type: string;
  sessionId?: string;
  jobId?: string;
  data?: any;
  timestamp?: string;
}

export interface WebSocketHookOptions {
  url: string;
  sessionId?: string;
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface WebSocketHookReturn {
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  sendMessage: (message: WebSocketMessage) => void;
  lastMessage: WebSocketMessage | null;
  reconnect: () => void;
}

/**
 * Custom React hook for WebSocket communication with automatic reconnection
 * Requirements: 6.3, 6.4 - Real-time session status updates and print progress broadcasting
 */
export function useWebSocket(options: WebSocketHookOptions): WebSocketHookReturn {
  const {
    url,
    sessionId,
    onMessage,
    onError,
    onConnect,
    onDisconnect,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isManuallyClosedRef = useRef(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setConnectionState('connecting');
      
      // Convert HTTP URL to WebSocket URL
      const wsUrl = url.replace(/^http/, 'ws');
      
      // Get security token from sessionStorage if available
      const token = sessionId ? sessionStorage.getItem(`ws_token_${sessionId}`) : null;
      
      // Add token to WebSocket URL as query parameter for authentication
      const authenticatedUrl = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;
      
      wsRef.current = new WebSocket(authenticatedUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected with authentication');
        setIsConnected(true);
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;
        
        // Join session if sessionId is provided
        if (sessionId) {
          const joinMessage: WebSocketMessage = {
            type: 'join-session',
            sessionId,
            data: { token }, // Include token in join message for additional security
            timestamp: new Date().toISOString()
          };
          wsRef.current?.send(JSON.stringify(joinMessage));
        }

        onConnect?.();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setConnectionState('disconnected');
        wsRef.current = null;

        onDisconnect?.();

        // Attempt to reconnect if not manually closed
        if (!isManuallyClosedRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
          scheduleReconnect();
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.error('Max reconnection attempts reached');
          setConnectionState('error');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionState('error');
        onError?.(error);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setConnectionState('error');
      scheduleReconnect();
    }
  }, [url, sessionId, onMessage, onError, onConnect, onDisconnect, maxReconnectAttempts]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectAttemptsRef.current++;
    const delay = reconnectInterval * Math.pow(2, Math.min(reconnectAttemptsRef.current - 1, 5)); // Exponential backoff

    console.log(`Scheduling reconnection attempt ${reconnectAttemptsRef.current} in ${delay}ms`);

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect, reconnectInterval]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    } else {
      console.warn('WebSocket not connected, cannot send message:', message.type);
    }
  }, []);

  const reconnect = useCallback(() => {
    isManuallyClosedRef.current = false;
    reconnectAttemptsRef.current = 0;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    isManuallyClosedRef.current = true;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
    }
  }, []);

  // Connect on mount and when dependencies change
  useEffect(() => {
    isManuallyClosedRef.current = false;
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    connectionState,
    sendMessage,
    lastMessage,
    reconnect
  };
}