import React, { useState, useEffect, useCallback } from 'react';
import { PrintOptions as PrintOptionsType, PriceBreakdown, FileMetadata, ApiResponse } from '../types';

interface PriceQuote {
  totalAmount: number;
  breakdown: PriceBreakdown;
}

interface PrintOptionsProps {
  files: FileMetadata[];
  onOptionsChange: (fileId: string, options: PrintOptionsType, pricing: PriceBreakdown) => void;
  onError: (error: string) => void;
  onClose?: () => void;
}

interface PricingConfig {
  colorPerPage: number;
  bwPerPage: number;
  duplexDiscount: number;
}

const DEFAULT_PRICING: PricingConfig = {
  colorPerPage: 500, // ₹5.00 in paise
  bwPerPage: 200,    // ₹2.00 in paise
  duplexDiscount: 10 // 10% discount
};

export default function PrintOptions({ 
  files, 
  onOptionsChange, 
  onError,
  onClose
}: PrintOptionsProps) {
  const [options, setOptions] = useState<PrintOptionsType>({
    copies: 1,
    colorMode: 'bw',
    duplex: false,
    paperSize: 'A4'
  });
  
  const [pricing, setPricing] = useState<PriceBreakdown>({
    totalPages: 0,
    colorPages: 0,
    bwPages: 0,
    basePrice: 0,
    totalPrice: 0,
    totalAmount: 0
  });
  
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING);

  // Get the file ID (assuming single file for individual config)
  const fileId = files.length > 0 ? files[0].id : '';

  // Calculate total pages from uploaded files
  const totalPages = files.reduce((sum, file) => sum + (file.pageCount || 1), 0);

  // Local pricing calculation
  const calculateLocalPricing = useCallback((): PriceBreakdown => {
    const pagesPerCopy = totalPages;
    const totalPagesWithCopies = pagesPerCopy * options.copies;
    
    let colorPages = 0;
    let bwPages = 0;
    
    if (options.colorMode === 'color') {
      colorPages = totalPagesWithCopies;
    } else {
      bwPages = totalPagesWithCopies;
    }
    
    const colorCost = colorPages * pricingConfig.colorPerPage;
    const bwCost = bwPages * pricingConfig.bwPerPage;
    const basePrice = colorCost + bwCost;
    
    let totalPrice = basePrice;
    if (options.duplex && totalPagesWithCopies > 1) {
      const discount = (basePrice * pricingConfig.duplexDiscount) / 100;
      totalPrice = basePrice - discount;
    }
    
    return {
      totalPages: totalPagesWithCopies,
      colorPages,
      bwPages,
      basePrice,
      totalPrice: Math.round(totalPrice),
      totalAmount: Math.round(totalPrice)
    };
  }, [totalPages, options, pricingConfig]);

  // Calculate pricing whenever options change
  useEffect(() => {
    if (files.length === 0 || !fileId) {
      const emptyPricing: PriceBreakdown = {
        totalPages: 0,
        colorPages: 0,
        bwPages: 0,
        basePrice: 0,
        totalPrice: 0,
        totalAmount: 0
      };
      setPricing(emptyPricing);
      onOptionsChange(fileId, options, emptyPricing);
      return;
    }

    const newPricing = calculateLocalPricing();
    setPricing(newPricing);
    onOptionsChange(fileId, options, newPricing);
  }, [files.length, options.copies, options.colorMode, options.duplex, options.paperSize, fileId]);

  const handleCopiesChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const copies = parseInt(e.target.value);
    setOptions(prev => ({ ...prev, copies }));
  };

  const handleColorModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const colorMode = e.target.value as 'color' | 'bw';
    setOptions(prev => ({ ...prev, colorMode }));
  };

  const handleDuplexChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const duplex = e.target.value === 'duplex';
    setOptions(prev => ({ ...prev, duplex }));
  };

  const handlePaperSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const paperSize = e.target.value as 'A4' | 'Letter';
    setOptions(prev => ({ ...prev, paperSize }));
  };

  if (files.length === 0) {
    return null; // Don't render anything if no files
  }

  const file = files[0]; // Single file for individual config

  return (
    <div className="print-options-container">
      {/* Header with file name and close button */}
      {onClose && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px',
          borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb'
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
              Configure Print Settings
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
              📄 {file.originalName} ({file.pageCount || 1} pages)
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              border: 'none',
              background: '#e5e7eb',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      <div className="options-form" style={{ padding: onClose ? '16px' : undefined }}>
        <div className="option-group">
          <label>Copies</label>
          <select value={options.copies} onChange={handleCopiesChange}>
            {[1,2,3,4,5,10,15,20].map(num => (
              <option key={num} value={num}>{num}</option>
            ))}
          </select>
        </div>

        <div className="option-group">
          <label>Color Mode</label>
          <select value={options.colorMode} onChange={handleColorModeChange}>
            <option value="bw">Black & White</option>
            <option value="color">Color</option>
          </select>
        </div>

        <div className="option-group">
          <label>Sides</label>
          <select value={options.duplex ? 'duplex' : 'single'} onChange={handleDuplexChange}>
            <option value="single">Single-side</option>
            <option value="duplex">Front & Back</option>
          </select>
        </div>

        <div className="option-group">
          <label>Paper Size</label>
          <select value={options.paperSize} onChange={handlePaperSizeChange}>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
          </select>
        </div>
        
        {/* Pricing Summary */}
        <div style={{
          marginTop: '20px',
          padding: '16px',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#1f2937' }}>
            Price Summary
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>Pages:</span>
            <span style={{ fontWeight: 600 }}>{pricing.totalPages}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>Copies:</span>
            <span style={{ fontWeight: 600 }}>{options.copies}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #e5e7eb', fontSize: '15px' }}>
            <span style={{ fontWeight: 600, color: '#1f2937' }}>Total:</span>
            <span style={{ fontWeight: 700, color: '#22c55e' }}>₹{((pricing.totalAmount || 0) / 100).toFixed(2)}</span>
          </div>
        </div>
        
        {/* Save button for modal */}
        {onClose && (
          <button 
            onClick={onClose}
            style={{
              width: '100%',
              padding: '14px',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '16px'
            }}
          >
            ✓ Save Settings
          </button>
        )}
      </div>
    </div>
  );
}