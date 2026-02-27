import React, { useState, useEffect, useCallback } from 'react';
import { PaymentStatus, PaymentRequest, UPIRequest, PriceBreakdown, ApiResponse } from '../types';

interface PaymentInterfaceProps {
  sessionId: string;
  pricing: PriceBreakdown;
  onPaymentComplete: (paymentRequest: PaymentRequest) => void;
  onError: (error: string) => void;
  enabled: boolean;
}

interface PaymentState {
  status: PaymentStatus;
  paymentRequest?: PaymentRequest;
  upiRequest?: UPIRequest;
  error?: string;
  retryCount: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const PAYMENT_CHECK_INTERVAL = 2000; // 2 seconds
const PAYMENT_TIMEOUT = 300000; // 5 minutes

export default function PaymentInterface({ 
  sessionId, 
  pricing, 
  onPaymentComplete, 
  onError,
  enabled 
}: PaymentInterfaceProps) {
  // Safety check - don't render if pricing is null or invalid
  if (!pricing || !pricing.totalAmount || pricing.totalAmount <= 0) {
    return null;
  }
  
  const [paymentState, setPaymentState] = useState<PaymentState>({
    status: PaymentStatus.PENDING,
    retryCount: 0
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMockPayment, setIsMockPayment] = useState(true); // Default to mock for demo

  // Initialize payment request
  const initializePayment = useCallback(async () => {
    if (!enabled || !pricing || pricing.totalAmount <= 0) {
      return;
    }

    setIsProcessing(true);
    setPaymentState(prev => ({ ...prev, error: undefined }));

    try {
      // Mock payment initialization for demo
      const mockPaymentRequest: PaymentRequest = {
        transactionId: `TXN${Date.now()}`,
        amount: pricing.totalAmount,
        status: PaymentStatus.PENDING,
        createdAt: new Date(),
        sessionId: sessionId
      };

      setPaymentState(prev => ({
        ...prev,
        status: PaymentStatus.PENDING,
        paymentRequest: mockPaymentRequest,
        error: undefined
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Payment initialization failed';
      setPaymentState(prev => ({ ...prev, error: errorMessage }));
      onError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [sessionId, pricing.totalAmount, enabled, onError]);

  // Handle mock payment confirmation
  const handleMockPayment = async () => {
    if (!paymentState.paymentRequest) return;

    setIsProcessing(true);

    try {
      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      const completedPayment: PaymentRequest = {
        ...paymentState.paymentRequest,
        status: PaymentStatus.COMPLETED,
        completedAt: new Date()
      };

      setPaymentState(prev => ({
        ...prev,
        status: PaymentStatus.COMPLETED,
        paymentRequest: completedPayment
      }));
      
      onPaymentComplete(completedPayment);
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = 'Payment completed successfully (demo mode)';
      
      // For demo, always succeed
      const completedPayment: PaymentRequest = {
        ...paymentState.paymentRequest,
        status: PaymentStatus.COMPLETED,
        completedAt: new Date()
      };

      setPaymentState(prev => ({
        ...prev,
        status: PaymentStatus.COMPLETED,
        paymentRequest: completedPayment
      }));
      
      onPaymentComplete(completedPayment);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-initialize payment when component mounts and is enabled
  useEffect(() => {
    if (enabled && pricing.totalAmount > 0 && !paymentState.paymentRequest) {
      initializePayment();
    }
  }, [enabled, pricing.totalAmount, paymentState.paymentRequest, initializePayment]);

  const formatPrice = (priceInPaise: number): string => {
    return `₹${(priceInPaise / 100).toFixed(2)}`;
  };

  if (!enabled || pricing.totalAmount <= 0) {
    return null; // Don't render anything if not enabled or no amount
  }

  return (
    <div className="payment-interface">
      {paymentState.status === PaymentStatus.PENDING && paymentState.paymentRequest && (
        <div className="payment-section">
          <div className="payment-card">
            <div className="payment-header">
              <h3>Complete Payment</h3>
              <div className="payment-amount">₹{formatPrice(pricing.totalAmount)}</div>
            </div>
            
            <button 
              onClick={handleMockPayment}
              disabled={isProcessing}
              className="pay-button"
            >
              {isProcessing ? (
                <>
                  <div className="spinner-small"></div>
                  Processing Payment...
                </>
              ) : (
                <>
                  <span className="payment-icon">💳</span>
                  Pay {formatPrice(pricing.totalAmount)}
                </>
              )}
            </button>
            
            <div className="payment-methods">
              <div className="method-item">
                <span className="method-icon">📱</span>
                <span>UPI</span>
              </div>
              <div className="method-item">
                <span className="method-icon">💳</span>
                <span>Card</span>
              </div>
              <div className="method-item">
                <span className="method-icon">🏦</span>
                <span>Net Banking</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentState.status === PaymentStatus.COMPLETED && (
        <div className="payment-success">
          <div className="success-message">
            <div className="success-icon">✅</div>
            <span>Payment Successful!</span>
            <p>Your print job has been queued</p>
          </div>
        </div>
      )}

      {paymentState.error && (
        <div className="payment-error">
          <div className="error-icon">❌</div>
          <p>{paymentState.error}</p>
          <button onClick={initializePayment} className="retry-button">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}