import React, { useState, useEffect, useCallback } from 'react';
import { PrintOptions as PrintOptionsType, PriceBreakdown, FileMetadata, ApiResponse } from '../types';

interface PriceQuote {
  totalAmount: number;
  breakdown: PriceBreakdown;
}

interface PrintOptionsProps {
  files: FileMetadata[];
  onOptionsChange: (options: PrintOptionsType, pricing: PriceBreakdown) => void;
  onError: (error: string) => void;
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
  onError 
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
    if (files.length === 0) {
      const emptyPricing: PriceBreakdown = {
        totalPages: 0,
        colorPages: 0,
        bwPages: 0,
        basePrice: 0,
        totalPrice: 0,
        totalAmount: 0
      };
      setPricing(emptyPricing);
      onOptionsChange(options, emptyPricing);
      return;
    }

    const newPricing = calculateLocalPricing();
    setPricing(newPricing);
    onOptionsChange(options, newPricing);
  }, [files.length, options.copies, options.colorMode, options.duplex, options.paperSize]); // Fixed dependencies

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

  return (
    <div className="print-options-container">
      <div className="options-form">
        <div className="option-group">
          <label>Copies</label>
          <select value={options.copies} onChange={handleCopiesChange}>
            {[1,2,3,4,5].map(num => (
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
      </div>
    </div>
  );
}