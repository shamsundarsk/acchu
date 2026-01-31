import React, { useState, useEffect, useCallback } from 'react';
import { PaymentStatus, PaymentRequest, UPIRequest, PriceBreakdown, ApiResponse } from '@sps/shared-types';

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
  const [paymentState, setPaymentState] = useState<PaymentState>({
    status: PaymentStatus.PENDING,
    retryCount: 0
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMockPayment, setIsMockPayment] = useState(true); // Default to mock for demo

  // Initialize payment request
  const initializePayment = useCallback(async () => {
    if (!enabled || pricing.totalAmount <= 0) {
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
      const errorMessage = error instanceof Error ? error.message : 'Payment confirmation failed';
      setPaymentState(prev => ({ ...prev, error: errorMessage }));
      onError(errorMessage);
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
        <button 
          onClick={handleMockPayment}
          disabled={isProcessing}
          className="pay-button"
        >
          {isProcessing ? 'Processing Payment...' : `Pay ${formatPrice(pricing.totalAmount)}`}
        </button>
      )}

      {paymentState.status === PaymentStatus.COMPLETED && (
        <div className="payment-success">
          <div className="success-message">
            ✅ Payment Successful! 
          </div>
        </div>
      )}

      {paymentState.error && (
        <div className="payment-error">
          <p>{paymentState.error}</p>
        </div>
      )}
    </div>
  );
}