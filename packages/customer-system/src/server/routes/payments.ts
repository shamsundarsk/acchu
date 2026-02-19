import { Router } from 'express';
import { ApiResponse, PaymentRequest, UPIRequest } from '../types';
import { RazorpayService } from '../services/RazorpayService';

const router = Router();

// Initialize Razorpay service
const razorpayService = new RazorpayService({
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || ''
});

// Check if Razorpay is configured
const isRazorpayConfigured = () => {
  return process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET;
};

/**
 * Create payment order
 * POST /api/payments/:sessionId/create-order
 */
router.post('/:sessionId/create-order', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { amount, printOptions, files } = req.body;

    if (!isRazorpayConfigured()) {
      // Fallback to mock payment for development
      const mockOrder = {
        id: `order_mock_${Date.now()}`,
        amount: amount,
        currency: 'INR',
        receipt: `receipt_${sessionId}_${Date.now()}`,
        status: 'created'
      };

      const response: ApiResponse<any> = {
        success: true,
        data: {
          orderId: mockOrder.id,
          amount: mockOrder.amount,
          currency: mockOrder.currency,
          keyId: 'rzp_test_mock',
          mock: true
        },
        message: 'Mock payment order created (Razorpay not configured)'
      };

      return res.json(response);
    }

    // Create Razorpay order
    const receipt = `receipt_${sessionId}_${Date.now()}`;
    const notes = {
      sessionId,
      printOptions: JSON.stringify(printOptions),
      fileCount: files?.length || 0
    };

    const order = await razorpayService.createOrder(amount, receipt, notes);

    const response: ApiResponse<any> = {
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment order'
    };
    res.status(500).json(response);
  }
});

/**
 * Verify payment
 * POST /api/payments/:sessionId/verify
 */
router.post('/:sessionId/verify', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { orderId, paymentId, signature } = req.body;

    if (!orderId || !paymentId || !signature) {
      const response: ApiResponse = {
        success: false,
        error: 'Missing required payment verification parameters'
      };
      return res.status(400).json(response);
    }

    if (!isRazorpayConfigured()) {
      // Mock verification for development
      const response: ApiResponse<{ verified: boolean; status: string }> = {
        success: true,
        data: {
          verified: true,
          status: 'completed'
        },
        message: 'Mock payment verified'
      };
      return res.json(response);
    }

    // Verify payment signature
    const isValid = razorpayService.verifyPaymentSignature({
      orderId,
      paymentId,
      signature
    });

    if (!isValid) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid payment signature'
      };
      return res.status(400).json(response);
    }

    // Fetch payment details
    const payment = await razorpayService.getPayment(paymentId);

    const response: ApiResponse<{ verified: boolean; status: string; payment: any }> = {
      success: true,
      data: {
        verified: true,
        status: payment.status === 'captured' ? 'completed' : payment.status,
        payment: {
          id: payment.id,
          amount: payment.amount,
          method: payment.method,
          email: payment.email,
          contact: payment.contact
        }
      }
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Payment verification failed'
    };
    res.status(500).json(response);
  }
});

/**
 * Get payment status
 * GET /api/payments/:sessionId/status/:orderId
 */
router.get('/:sessionId/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!isRazorpayConfigured()) {
      // Mock status for development
      const response: ApiResponse<{ status: string }> = {
        success: true,
        data: {
          status: 'completed'
        }
      };
      return res.json(response);
    }

    const order = await razorpayService.getOrder(orderId);

    const response: ApiResponse<{ status: string; order: any }> = {
      success: true,
      data: {
        status: order.status,
        order: {
          id: order.id,
          amount: order.amount,
          amountPaid: order.amount_paid,
          amountDue: order.amount_due,
          currency: order.currency,
          receipt: order.receipt
        }
      }
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get payment status'
    };
    res.status(500).json(response);
  }
});

/**
 * Refund payment
 * POST /api/payments/:sessionId/refund
 */
router.post('/:sessionId/refund', async (req, res) => {
  try {
    const { paymentId, amount } = req.body;

    if (!paymentId) {
      const response: ApiResponse = {
        success: false,
        error: 'Payment ID is required'
      };
      return res.status(400).json(response);
    }

    if (!isRazorpayConfigured()) {
      const response: ApiResponse = {
        success: false,
        error: 'Razorpay not configured'
      };
      return res.status(400).json(response);
    }

    const refund = await razorpayService.refundPayment(paymentId, amount);

    const response: ApiResponse<any> = {
      success: true,
      data: {
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status
      },
      message: 'Refund processed successfully'
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Refund failed'
    };
    res.status(500).json(response);
  }
});

// Legacy endpoints for backward compatibility
router.post('/:sessionId/generate', async (req, res) => {
  // Redirect to create-order
  req.url = `/${req.params.sessionId}/create-order`;
  return router.handle(req, res);
});

router.get('/:sessionId/verify/:transactionId', async (req, res) => {
  // Redirect to status
  req.url = `/${req.params.sessionId}/status/${req.params.transactionId}`;
  return router.handle(req, res);
});

export { router as paymentRoutes };
