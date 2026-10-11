/* ============================================================
   ShopPro - PDF Document Exporter (Receipts & Reports)
   Generates clean, printable PDF documents directly in browser
   ============================================================ */

(function () {
  function printDocument(title, htmlContent) {
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';

    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          @page {
            size: auto;
            margin: 10mm;
          }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 15px;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            text-align: center;
            border-bottom: 2px dashed #9ca3af;
            padding-bottom: 12px;
            margin-bottom: 15px;
          }
          .title {
            font-size: 20px;
            font-weight: 800;
            text-transform: uppercase;
            margin: 0 0 4px 0;
          }
          .meta {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
            font-size: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          th, td {
            padding: 8px 6px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
          }
          th {
            background-color: #f3f4f6;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 11px;
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .bold { font-weight: 700; }
          .summary-box {
            margin-top: 15px;
            border-top: 2px dashed #9ca3af;
            padding-top: 10px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
          }
          .grand-total {
            font-size: 16px;
            font-weight: 800;
            color: #1e3a8a;
            border-top: 1px solid #d1d5db;
            padding-top: 8px;
            margin-top: 6px;
          }
          .footer {
            text-align: center;
            margin-top: 25px;
            font-size: 12px;
            color: #4b5563;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(printFrame);
      }, 2000);
    }, 500);
  }

  // 1. Export Order Receipt PDF
  function exportOrderReceiptPdf(order, shopInfo = {}) {
    if (!order) return;
    const shopName = shopInfo.name || 'SHOPPRO POS';
    const shopAddress = shopInfo.address || '';
    const shopPhone = shopInfo.phone || '';

    const itemsHtml = (order.items || []).map((it, idx) => `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td>
          <div class="bold">${it.product_name}</div>
          <div style="font-size:10px;color:#6b7280;">${it.product_sku || ''}</div>
        </td>
        <td class="text-center">${it.quantity}</td>
        <td class="text-right">${window.formatCurrency ? window.formatCurrency(it.price) : it.price + '₫'}</td>
        <td class="text-right bold">${window.formatCurrency ? window.formatCurrency(it.subtotal) : it.subtotal + '₫'}</td>
      </tr>
    `).join('');

    const html = `
      <div class="header">
        <h1 class="title">${shopName}</h1>
        ${shopAddress ? `<div>${shopAddress}</div>` : ''}
        ${shopPhone ? `<div>Hotline: ${shopPhone}</div>` : ''}
        <div style="margin-top:8px;font-weight:700;font-size:15px;">HÓA ĐƠN BÁN LẺ</div>
        <div style="font-size:12px;color:#4b5563;">Mã: ${order.order_code}</div>
      </div>

      <div class="meta">
        <div><strong>Khách hàng:</strong> ${order.customer_name || 'Khách lẻ'} ${order.customer_phone ? `(${order.customer_phone})` : ''}</div>
        <div><strong>Ngày:</strong> ${new Date(order.created_at || Date.now()).toLocaleString('vi-VN')}</div>
      </div>
      <div class="meta">
        <div><strong>Thu ngân:</strong> ${order.staff_name || 'Thu Ngân'}</div>
        <div><strong>Thanh toán:</strong> ${order.payment_method === 'cash' ? 'Tiền mặt' : (order.payment_method === 'card' ? 'Thẻ' : 'Chuyển khoản')}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center" style="width:30px;">#</th>
            <th>Sản phẩm</th>
            <th class="text-center" style="width:50px;">SL</th>
            <th class="text-right" style="width:90px;">Đơn giá</th>
            <th class="text-right" style="width:100px;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="summary-box">
        <div class="summary-row">
          <span>Tạm tính:</span>
          <span class="bold">${window.formatCurrency ? window.formatCurrency(order.subtotal) : order.subtotal + '₫'}</span>
        </div>
        ${order.discount_amount > 0 ? `
          <div class="summary-row" style="color:#059669;">
            <span>Giảm giá:</span>
            <span>-${window.formatCurrency ? window.formatCurrency(order.discount_amount) : order.discount_amount + '₫'}</span>
          </div>
        ` : ''}
        <div class="summary-row grand-total">
          <span>TỔNG THANH TOÁN:</span>
          <span>${window.formatCurrency ? window.formatCurrency(order.total) : order.total + '₫'}</span>
        </div>
        ${order.change_amount > 0 ? `
          <div class="summary-row" style="margin-top:4px;">
            <span>Tiền trả lại khách:</span>
            <span>${window.formatCurrency ? window.formatCurrency(order.change_amount) : order.change_amount + '₫'}</span>
          </div>
        ` : ''}
      </div>

      <div class="footer">
        <div>Cảm ơn quý khách và hẹn gặp lại!</div>
        <div style="font-size:10px;margin-top:4px;color:#9ca3af;">In từ hệ thống ShopPro POS</div>
      </div>
    `;

    printDocument(`Hoa_Don_${order.order_code}`, html);
  }

  // 2. Export Report Summary PDF
  function exportReportPdf(title, subtitle, tableHeaders, tableRows, summary) {
    const headersHtml = tableHeaders.map(h => `<th>${h}</th>`).join('');
    const rowsHtml = tableRows.map(row => `
      <tr>
        ${row.map((cell, idx) => `<td class="${idx >= row.length - 2 ? 'text-right' : ''}">${cell}</td>`).join('')}
      </tr>
    `).join('');

    const html = `
      <div class="header">
        <h1 class="title">${title}</h1>
        <div style="font-size:12px;color:#4b5563;">${subtitle || ''}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Thời gian xuất: ${new Date().toLocaleString('vi-VN')}</div>
      </div>

      <table>
        <thead>
          <tr>${headersHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      ${summary ? `
        <div class="summary-box">
          ${Object.entries(summary).map(([k, v]) => `
            <div class="summary-row ${k.includes('Tổng') ? 'grand-total' : ''}">
              <span>${k}:</span>
              <span class="bold">${v}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="footer">
        <div>Báo cáo được khởi tạo tự động từ ShopPro POS</div>
      </div>
    `;

    printDocument(title.replace(/\s+/g, '_'), html);
  }

  window.pdfExporter = {
    exportOrderReceiptPdf,
    exportReportPdf
  };
})();
