/* ============================================
   ShopPro Plugin: Electronic Scale Integration
   Decodes weight-embedded EAN-13 barcodes (20-29)
   ============================================ */

class ScaleIntegrationPlugin {
  constructor() {
    this.name = 'Electronic Scale';
    this.context = null;
  }

  onInit(context) {
    this.context = context;
    console.log('[Plugin: ScaleIntegration] Ready to parse scale barcodes');
  }

  // Hook triggered when a barcode is scanned anywhere in the app
  onBarcodeScanned(barcode) {
    if (!barcode || typeof barcode !== 'string') return null;
    const clean = barcode.trim();

    // Check if barcode is standard 13-digit scale barcode (prefix 20 to 29)
    // Format: 2[0-9] PPPP WWWWW C (P = Product SKU/Code, W = Weight in grams)
    if (clean.length === 13 && /^(2[0-9])/.test(clean)) {
      const productCode = clean.substring(2, 7);
      const weightGrams = parseInt(clean.substring(7, 12), 10);
      const weightKg = weightGrams / 1000;

      return {
        isScaleBarcode: true,
        originalBarcode: clean,
        productCode: productCode,
        weightKg: Number(weightKg.toFixed(3)),
        weightGrams: weightGrams,
        message: `Phát hiện tem cân điện tử: Mã hàng ${productCode}, Khối lượng: ${weightKg} kg`
      };
    }

    return null;
  }

  onDestroy() {
    console.log('[Plugin: ScaleIntegration] Destroyed');
  }
}

module.exports = ScaleIntegrationPlugin;
