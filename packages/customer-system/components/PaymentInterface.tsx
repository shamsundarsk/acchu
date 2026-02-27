import React, { useState, useEffect } from 'react';
import { PriceBreakdown, ApiResponse } from '../types/shared-types';
import './PaymentInterface.css';

interface PaymentInterfaceProps {
  sessionId: string;
  pricing: PriceBreakdown;
  onPaymentComplete: (transactionId: string) => void;
  onError: (error: string) => void;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function PaymentInterface({
  sessionId,
  pricing,
  onPaymentComplete,
  onError
}: PaymentInterfaceProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'mock'>('razorpay');
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Razorpay');
      setPaymentMethod('mock');
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const createPaymentOrder = async () => {
    try {
      const response = await fetch(`/api/payments/${sessionId}/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: pricing.totalAmount,
          printOptions: {},
          files: []
        })
      });

      const data: ApiResponse<any> = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create payment order');
      }

      return data.data;
    } catch (error) {
      throw error;
    }
  };

  const verifyPayment = async (orderId: string, paymentId: string, signature: string) => {
    try {
      const response = await fetch(`/api/payments/${sessionId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, paymentId, signature })
      });

      const data: ApiResponse<any> = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Payment verification failed');
      }

      return data.data;
    } catch (error) {
      throw error;
    }
  };

  const handleRazorpayPayment = async () => {
    if (!razorpayLoaded) {
      onError('Razorpay not loaded. Please refresh and try again.');
      return;
    }

    setIsProcessing(true);

    try {
      // Create order
      const orderData = await createPaymentOrder();

      // Check if mock payment
      if (orderData.mock) {
        // Simulate payment success for mock
        setTimeout(() => {
          onPaymentComplete(orderData.orderId);
          setIsProcessing(false);
        }, 2000);
        return;
      }

      // Initialize Razorpay
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'ACCHU Print Shop',
        description: 'Print Service Payment',
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            // Verify payment
            const verification = await verifyPayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );

            if (verification.verified) {
              onPaymentComplete(response.razorpay_payment_id);
            } else {
              onError('Payment verification failed');
            }
          } catch (error) {
            onError(error instanceof Error ? error.message : 'Payment verification failed');
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: {
          name: '',
          email: '',
          contact: ''
        },
        theme: {
          color: '#667eea'
        },
        modal: {
          ondismiss: function() {
            setIsProcessing(false);
            onError('Payment cancelled');
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      setIsProcessing(false);
      onError(error instanceof Error ? error.message : 'Payment failed');
    }
  };

  const handleMockPayment = async () => {
    setIsProcessing(true);

    try {
      const orderData = await createPaymentOrder();
      
      // Simulate payment processing
      setTimeout(() => {
        onPaymentComplete(orderData.orderId);
        setIsProcessing(false);
      }, 2000);
    } catch (error) {
      setIsProcessing(false);
      onError(error instanceof Error ? error.message : 'Payment failed');
    }
  };

  const handlePayment = () => {
    if (paymentMethod === 'razorpay') {
      handleRazorpayPayment();
    } else {
      handleMockPayment();
    }
  };

  return (
    <div className="payment-interface">
      <div className="payment-summary">
        <h3>Payment Summary</h3>
        <div className="summary-row">
          <span>Total Pages:</span>
          <span>{pricing.totalPages}</span>
        </div>
        {pricing.colorPages > 0 && (
          <div className="summary-row">
            <span>Color Pages:</span>
            <span>{pricing.colorPages} × ₹{(pricing.colorPages > 0 ? pricing.basePrice / pricing.colorPages / 100 : 0).toFixed(2)}</span>
          </div>
        )}
        {pricing.bwPages > 0 && (
          <div className="summary-row">
            <span>B&W Pages:</span>
            <span>{pricing.bwPages} × ₹{(pricing.bwPages > 0 ? pricing.basePrice / pricing.bwPages / 100 : 0).toFixed(2)}</span>
          </div>
        )}
        <div className="summary-row total">
          <span>Total Amount:</span>
          <span className="amount">₹{(pricing.totalAmount / 100).toFixed(2)}</span>
        </div>
      </div>

      <div className="payment-methods">
        <h3>Payment Method</h3>
        <div className="method-options">
          <label className={`method-option ${paymentMethod === 'razorpay' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="payment-method"
              value="razorpay"
              checked={paymentMethod === 'razorpay'}
              onChange={() => setPaymentMethod('razorpay')}
              disabled={!razorpayLoaded}
            />
            <span>Razorpay (UPI, Card, Wallet)</span>
          </label>
          <label className={`method-option ${paymentMethod === 'mock' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="payment-method"
              value="mock"
              checked={paymentMethod === 'mock'}
              onChange={() => setPaymentMethod('mock')}
            />
            <span>Mock Payment (Testing)</span>
          </label>
        </div>
      </div>

      <button
        className="pay-button"
        onClick={handlePayment}
        disabled={isProcessing}
      >
        {isProcessing ? 'Processing...' : `Pay ₹${(pricing.totalAmount / 100).toFixed(2)}`}
      </button>
    </div>
  );
}
