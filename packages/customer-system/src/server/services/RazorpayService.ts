import Razorpay from 'razorpay';
import crypto from 'crypto';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

export interface PaymentOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface PaymentVerification {
  orderId: string;
  paymentId: string;
  signature: string;
}

/**
 * RazorpayService handles payment processing via Razorpay
 */
export class RazorpayService {
  private razorpay: Razorpay;
  private keySecret: string;

  constructor(config: RazorpayConfig) {
    this.razorpay = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret
    });
    this.keySecret = config.keySecret;
  }

  /**
   * Create a payment order
   */
  async createOrder(amount: number, receipt: string, notes?: any): Promise<PaymentOrder> {
    try {
      const options = {
        amount: amount, // Amount in paise (smallest currency unit)
        currency: 'INR',
        receipt: receipt,
        notes: notes || {}
      };

      const order = await this.razorpay.orders.create(options);
      
      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status
      };
    } catch (error) {
      console.error('Razorpay order creation failed:', error);
      throw new Error('Failed to create payment order');
    }
  }

  /**
   * Verify payment signature
   */
  verifyPaymentSignature(verification: PaymentVerification): boolean {
    try {
      const { orderId, paymentId, signature } = verification;
      
      // Generate expected signature
      const text = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(text)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      console.error('Payment verification failed:', error);
      return false;
    }
  }

  /**
   * Fetch payment details
   */
  async getPayment(paymentId: string): Promise<any> {
    try {
      return await this.razorpay.payments.fetch(paymentId);
    } catch (error) {
      console.error('Failed to fetch payment:', error);
      throw new Error('Failed to fetch payment details');
    }
  }

  /**
   * Fetch order details
   */
  async getOrder(orderId: string): Promise<any> {
    try {
      return await this.razorpay.orders.fetch(orderId);
    } catch (error) {
      console.error('Failed to fetch order:', error);
      throw new Error('Failed to fetch order details');
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(paymentId: string, amount?: number): Promise<any> {
    try {
      const options: any = { payment_id: paymentId };
      if (amount) {
        options.amount = amount;
      }
      
      return await this.razorpay.payments.refund(paymentId, options);
    } catch (error) {
      console.error('Refund failed:', error);
      throw new Error('Failed to process refund');
    }
  }
}
