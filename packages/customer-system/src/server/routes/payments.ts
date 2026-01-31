import { Router } from 'express';
import { ApiResponse, PaymentRequest, UPIRequest } from '../types';

const router = Router();

// Generate UPI payment request
router.post('/:sessionId/generate', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { amount, printOptions } = req.body;

    // TODO: Calculate actual pricing based on print options
    const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const upiRequest: UPIRequest = {
      qrCode: `upi://pay?pa=merchant@upi&pn=ACCHU&am=${amount}&tr=${transactionId}&tn=Print Payment`,
      paymentUrl: `upi://pay?pa=merchant@upi&pn=ACCHU&am=${amount}&tr=${transactionId}&tn=Print Payment`,
      amount,
      transactionId,
    };

    const response: ApiResponse<UPIRequest> = {
      success: true,
      data: upiRequest,
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate payment request',
    };
    res.status(500).json(response);
  }
});

// Verify payment status
router.get('/:sessionId/verify/:transactionId', async (req, res) => {
  try {
    const { sessionId, transactionId } = req.params;

    // TODO: Implement actual payment verification
    // For MVP, simulate payment success after delay
    const isVerified = Math.random() > 0.3; // 70% success rate for testing

    const response: ApiResponse<{ verified: boolean; status: string }> = {
      success: true,
      data: {
        verified: isVerified,
        status: isVerified ? 'completed' : 'pending',
      },
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Payment verification failed',
    };
    res.status(500).json(response);
  }
});

// Mock payment confirmation (for MVP)
router.post('/:sessionId/confirm', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { transactionId } = req.body;

    // Mock payment confirmation
    const response: ApiResponse<{ confirmed: boolean }> = {
      success: true,
      data: { confirmed: true },
      message: 'Payment confirmed (mock)',
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Payment confirmation failed',
    };
    res.status(500).json(response);
  }
});

export { router as paymentRoutes };