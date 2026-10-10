/* ============================================
   ShopPro Desktop - Reports Module
   Báo cáo doanh thu, Lợi nhuận gộp,
   Phân tích theo khung giờ & Xuất Excel/CSV/PDF
   ============================================ */

(() => {
  let profitData = null;
  let revenueData = [];
  let hourlyData = [];
  let topProductsData = [];
  let dashboardStats = null;
  const chartInstances = {};

  function destroyChart(name) {
    if (chartInstances[name]) {
      try { chartInstances[name].destroy(); } catch (_) {}
      chartInstances[name] = null;
    }
  }

  function render() {
    const today = new Date();
    const last7 = new Date(today);
    last7.setDate(last7.getDate() - 6);

    const fromDate = last7.toISOString().split('T')[0];
    const toDate = today.toISOString().split('T')[0];

    return `
      <div class="page-header">
        <h1>📊 Báo Cáo & Thống Kê</h1>
        <div class="page-header-actions" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="date" class="form-control" id="reportFrom" value="${fromDate}" onchange="pageModules.reports.loadAll()" style="width:140px;">
          <span class="text-muted">→</span>
          <input type="date" class="form-control" id="reportTo" value="${toDate}" onchange="pageModules.reports.loadAll()" style="width:140px;">
          <button class="btn btn-outline btn-sm" onclick="pageModules.reports.loadAll()" title="Làm mới số liệu">
            ${ICONS.refresh} Cập nhật
          </button>
          <button class="btn btn-success btn-sm" onclick="pageModules.reports.exportCSV()" title="Tải file Excel / CSV UTF-8">
            📥 Xuất Excel / CSV
          </button>
          <button class="btn btn-primary btn-sm" onclick="pageModules.reports.exportPDF()" title="In hoặc lưu file PDF">
            🖨️ In / Xuất PDF
          </button>
        </div>
      </div>

      <div class="page-content">
        <!-- Overview KPIs -->
        <div class="grid grid-4 mb-xl" id="reportStats">
          <div class="stat-card">
            <div class="stat-icon purple">${ICONS.package}</div>
            <div class="stat-value" id="rTotalProducts">—</div>
            <div class="stat-label">Tổng sản phẩm</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div class="stat-value" id="rTotalOrders">—</div>
            <div class="stat-label">Tổng đơn hàng</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div class="stat-value" id="rTotalRevenue">—</div>
            <div class="stat-label">Tổng doanh thu lũy kế</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon orange">${ICONS.users}</div>
            <div class="stat-value" id="rTotalCustomers">—</div>
            <div class="stat-label">Tổng khách hàng</div>
          </div>
        </div>

        <!-- GROSS PROFIT SECTION (Báo cáo Lợi Nhuận Gộp) -->
        <div class="card mb-xl" style="border-left: 4px solid var(--accent); background: linear-gradient(180deg, var(--accent-light), transparent);">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h3>💰 Báo Cáo Lợi Nhuận Gộp (Gross Profit)</h3>
            <span class="text-secondary" style="font-size:12px;" id="profitDateLabel">Trong khoảng thời gian chọn</span>
          </div>
          <div class="card-body">
            <div class="grid grid-4 gap-md">
              <div class="stat-card" style="background:var(--bg-card);">
                <div class="stat-label">DOANH THU THUẦN</div>
                <div class="stat-value text-cyan" id="pNetRevenue" style="font-size:22px;">0₫</div>
                <div class="text-muted mt-sm" style="font-size:11px;" id="pGrossRevenueSub">Tổng bán: 0₫</div>
              </div>
              <div class="stat-card" style="background:var(--bg-card);">
                <div class="stat-label">GIÁ VỐN HÀNG BÁN (COGS)</div>
                <div class="stat-value text-secondary" id="pTotalCost" style="font-size:22px;">0₫</div>
                <div class="text-muted mt-sm" style="font-size:11px;">Tính theo giá nhập kho</div>
              </div>
              <div class="stat-card" style="background:var(--bg-card); border: 1.5px solid rgba(0, 184, 148, 0.4);">
                <div class="stat-label text-success font-bold">LỢI NHUẬN GỘP</div>
                <div class="stat-value text-success" id="pGrossProfit" style="font-size:24px; font-weight:800;">0₫</div>
                <div class="text-muted mt-sm" style="font-size:11px;">= Doanh thu thuần - Giá vốn</div>
              </div>
              <div class="stat-card" style="background:var(--bg-card);">
                <div class="stat-label">TỶ SUẤT LỢI NHUẬN</div>
                <div class="stat-value text-orange" id="pProfitMargin" style="font-size:22px;">0%</div>
                <div class="text-muted mt-sm" style="font-size:11px;" id="pRefundSub">Hoàn trả: 0₫</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Today stats -->
        <div class="grid grid-2 mb-xl">
          <div class="stat-card" style="border-left:3px solid var(--success);">
            <div class="stat-label mb-sm">DOANH THU HÔM NAY</div>
            <div class="stat-value text-success" id="rTodayRevenue" style="font-size:28px;">—</div>
            <div class="text-muted mt-sm" id="rTodayOrders">— đơn hàng</div>
          </div>
          <div class="stat-card" style="border-left:3px solid var(--warning);">
            <div class="stat-label mb-sm">SẢN PHẨM SẮP HẾT HÀNG</div>
            <div class="stat-value text-warning" id="rLowStockCount" style="font-size:28px;">—</div>
            <div class="text-muted mt-sm">sản phẩm dưới mức tồn tối thiểu</div>
          </div>
        </div>

        <!-- Charts: Revenue by Date & Hourly Sales -->
        <div class="grid grid-2 mb-xl">
          <div class="card">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
              <h3>📈 Doanh Thu Theo Ngày</h3>
              <span class="badge badge-default" style="font-size:11px;">Biểu đồ trực quan</span>
            </div>
            <div class="card-body">
              <div id="revenueChartContainer" style="position:relative; height:240px; width:100%;">
                <canvas id="revenueCanvas"></canvas>
              </div>
            </div>
          </div>

          <!-- HOURLY SALES CHART (Khung Giờ Cao Điểm) -->
          <div class="card">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
              <h3>⏰ Phân Tích Doanh Thu Khung Giờ (0h - 23h)</h3>
              <span class="badge badge-warning" style="font-size:11px;" id="hourlyPeakBadge">Giờ cao điểm</span>
            </div>
            <div class="card-body">
              <div id="hourlyChartContainer" style="position:relative; height:240px; width:100%;">
                <canvas id="hourlyCanvas"></canvas>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Products & Payment Breakdown -->
        <div class="grid grid-2 mb-xl">
          <div class="card">
            <div class="card-header">
              <h3>🏆 Top Sản Phẩm Bán Chạy</h3>
            </div>
            <div class="card-body" id="topProductsChart">
              <div class="text-center text-muted">Đang tải...</div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>💳 Phân Bổ Phương Thức Thanh Toán</h3>
            </div>
            <div class="card-body" id="paymentBreakdown">
              <div style="display:flex; align-items:center; gap:20px; min-height:220px; padding:10px 0;">
                <div style="position:relative; width:170px; height:170px; flex-shrink:0;">
                  <canvas id="paymentCanvas"></canvas>
                </div>
                <div id="paymentLegendList" style="flex:1;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Low stock products -->
        <div class="card mb-xl">
          <div class="card-header">
            <h3>⚠️ Danh Sách Sản Phẩm Cần Nhập Thêm</h3>
          </div>
          <div class="card-body" id="lowStockList">
            <div class="text-center text-muted">Đang tải...</div>
          </div>
        </div>

        <!-- AI Business Assistant & ABC Analysis (F5) -->
        <div class="card mb-xl" style="border-top:3px solid var(--cyan);">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <h3>🤖 Trợ Lý Kinh Doanh AI & Phân Tích ABC (Pareto 80/20)</h3>
              <p class="text-secondary" style="font-size:12px; margin-top:2px;">Tự động phân nhóm sản phẩm chủ lực và gợi ý quyết định nhập hàng / xả kho thông minh</p>
            </div>
            <button class="btn btn-outline btn-sm" onclick="pageModules.reports.loadABCAnalysis()">
              🔄 Phân tích lại
            </button>
          </div>
          <div class="card-body">
            <!-- Summary stats of A, B, C -->
            <div class="grid grid-3 gap-md mb-md">
              <div class="stat-card" style="background:rgba(16, 185, 129, 0.08); border:1px solid rgba(16, 185, 129, 0.3);">
                <div class="stat-label text-success font-bold">⭐ NHÓM A — CHỦ LỰC (80% Doanh Thu)</div>
                <div class="stat-value text-success" id="abcCountA">0 sản phẩm</div>
                <div class="text-muted mt-xs" style="font-size:11px;">Mặt hàng sinh lời cao nhất, luôn đảm bảo có hàng sẵn</div>
              </div>
              <div class="stat-card" style="background:rgba(59, 130, 246, 0.08); border:1px solid rgba(59, 130, 246, 0.3);">
                <div class="stat-label text-cyan font-bold">✨ NHÓM B — TIỀM NĂNG (15% Doanh Thu)</div>
                <div class="stat-value text-cyan" id="abcCountB">0 sản phẩm</div>
                <div class="text-muted mt-xs" style="font-size:11px;">Doanh số ổn định, theo dõi biến động định kỳ</div>
              </div>
              <div class="stat-card" style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.3);">
                <div class="stat-label text-danger font-bold">💤 NHÓM C — TỒN ĐỌNG (5% Doanh Thu)</div>
                <div class="stat-value text-danger" id="abcCountC">0 sản phẩm</div>
                <div class="text-muted mt-xs" style="font-size:11px;">Bán chậm hoặc đọng vốn, nên làm combo hoặc xả hàng</div>
              </div>
            </div>

            <!-- Table of ABC analysis -->
            <div class="table-responsive" style="max-height:360px; overflow-y:auto;">
              <table class="table" id="abcTable">
                <thead>
                  <tr>
                    <th>Nhóm</th>
                    <th>Tên Sản Phẩm</th>
                    <th>Mã / Barcode</th>
                    <th style="text-align:right;">Đã bán</th>
                    <th style="text-align:right;">Doanh thu</th>
                    <th style="text-align:right;">Tích lũy %</th>
                    <th style="text-align:right;">Tồn kho</th>
                    <th style="text-align:right;">Dự báo hết hàng</th>
                    <th>Gợi ý của AI</th>
                  </tr>
                </thead>
                <tbody id="abcTableBody">
                  <tr><td colspan="9" class="text-center text-muted">Đang phân tích dữ liệu...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Cash Flow & Shift History (F1, F2) -->
        <div class="grid grid-2 mb-xl">
          <!-- Cash Flow -->
          <div class="card">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h3>💵 Sổ Quỹ Thu Chi Tiền Mặt</h3>
                <span class="text-secondary" style="font-size:11px;" id="cfPeriodLabel">Gần đây</span>
              </div>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-outline btn-sm" onclick="openCashFlowModal('income')">➕ Thu</button>
                <button class="btn btn-outline btn-sm" onclick="openCashFlowModal('expense')">➖ Chi</button>
              </div>
            </div>
            <div class="card-body">
              <div class="grid grid-3 gap-sm mb-md">
                <div style="background:var(--bg-secondary); padding:8px 10px; border-radius:6px; border:1px solid var(--border);">
                  <div style="font-size:10.5px; color:var(--text-secondary);">TỔNG THU</div>
                  <div style="font-size:15px; font-weight:700; color:var(--success);" id="cfTotalIncome">0₫</div>
                </div>
                <div style="background:var(--bg-secondary); padding:8px 10px; border-radius:6px; border:1px solid var(--border);">
                  <div style="font-size:10.5px; color:var(--text-secondary);">TỔNG CHI</div>
                  <div style="font-size:15px; font-weight:700; color:var(--danger);" id="cfTotalExpense">0₫</div>
                </div>
                <div style="background:var(--bg-secondary); padding:8px 10px; border-radius:6px; border:1px solid var(--border);">
                  <div style="font-size:10.5px; color:var(--text-secondary);">QUỸ RÒNG</div>
                  <div style="font-size:15px; font-weight:700; color:var(--accent);" id="cfNetCash">0₫</div>
                </div>
              </div>
              <div class="table-responsive" style="max-height:240px; overflow-y:auto;">
                <table class="table" style="font-size:12px;">
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Loại</th>
                      <th>Danh mục</th>
                      <th style="text-align:right;">Số tiền</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody id="cfTableBody">
                    <tr><td colspan="5" class="text-center text-muted">Đang tải sổ quỹ...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Shift History -->
          <div class="card">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h3>🏪 Lịch Sử Ca Làm Việc & Két Tiền</h3>
                <span class="text-secondary" style="font-size:11px;">Đối soát tiền mặt</span>
              </div>
              <button class="btn btn-primary btn-sm" onclick="openShiftManagerModal()">
                💼 Quản lý ca
              </button>
            </div>
            <div class="card-body">
              <div class="table-responsive" style="max-height:300px; overflow-y:auto;">
                <table class="table" style="font-size:12px;">
                  <thead>
                    <tr>
                      <th>Ca</th>
                      <th>Nhân viên</th>
                      <th>Bắt đầu</th>
                      <th>Đóng ca</th>
                      <th style="text-align:right;">Đầu ca</th>
                      <th style="text-align:right;">Thực tế</th>
                      <th style="text-align:right;">Chênh lệch</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody id="shiftsTableBody">
                    <tr><td colspan="8" class="text-center text-muted">Đang tải lịch sử ca...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function init() {
    await loadAll();
  }

  async function loadAll() {
    await loadDashboard();

    const from = document.getElementById('reportFrom')?.value || '';
    const to = document.getElementById('reportTo')?.value || '';

    if (from && to) {
      await loadProfitReport(from, to);
      await loadRevenueChart(from, to);
      await loadHourlyChart(from, to);
      await loadTopProducts(from, to);
      await loadPaymentBreakdown(from, to);
    }

    await loadABCAnalysis();
    await loadCashFlowReport(from, to);
    await loadShiftsHistory();
  }

  async function loadDashboard() {
    try {
      const stats = await api.getDashboardStats();
      dashboardStats = stats;

      setTextContent('rTotalProducts', stats.totalProducts);
      setTextContent('rTotalOrders', stats.totalOrders);
      setTextContent('rTotalRevenue', formatCurrency(stats.totalRevenue));
      setTextContent('rTotalCustomers', stats.totalCustomers);
      setTextContent('rTodayRevenue', formatCurrency(stats.todayRevenue));
      setTextContent('rTodayOrders', `${stats.todayOrders} đơn hàng`);
      setTextContent('rLowStockCount', stats.lowStockProducts?.length || 0);

      // Low stock list
      const lowStockEl = document.getElementById('lowStockList');
      if (lowStockEl && stats.lowStockProducts) {
        if (stats.lowStockProducts.length === 0) {
          lowStockEl.innerHTML = '<div class="text-center text-muted" style="padding:20px;">✅ Không có sản phẩm nào sắp hết hàng</div>';
        } else {
          lowStockEl.innerHTML = stats.lowStockProducts.map(p => `
            <div class="flex justify-between items-center" style="padding:8px 0; border-bottom:1px solid var(--border-light);">
              <div>
                <div class="fw-600">${escapeHtml(p.name)}</div>
                <div class="text-muted" style="font-size:11px;">${escapeHtml(p.sku)} ${p.barcode ? `· ${escapeHtml(p.barcode)}` : ''}</div>
              </div>
              <span class="badge badge-warning">Còn ${p.stock} ${escapeHtml(p.unit || 'sp')} (Tối thiểu: ${p.min_stock})</span>
            </div>
          `).join('');
        }
      }
    } catch (err) {
      console.error('Dashboard error:', err);
    }
  }

  async function loadProfitReport(from, to) {
    try {
      profitData = await api.getProfitReport(from, to);
      if (!profitData) return;

      setTextContent('pNetRevenue', formatCurrency(profitData.netRevenue));
      setTextContent('pGrossRevenueSub', `Tổng bán: ${formatCurrency(profitData.grossRevenue)}`);
      setTextContent('pTotalCost', formatCurrency(profitData.totalCost));
      setTextContent('pGrossProfit', formatCurrency(profitData.grossProfit));
      setTextContent('pProfitMargin', `${profitData.profitMargin}%`);
      setTextContent('pRefundSub', `Hoàn trả: ${formatCurrency(profitData.totalRefund)} (${profitData.returnCount} phiếu)`);
      setTextContent('profitDateLabel', `Từ ${formatDateOnly(from)} đến ${formatDateOnly(to)}`);
    } catch (err) {
      console.error('Profit report error:', err);
    }
  }

  async function loadRevenueChart(from, to) {
    try {
      revenueData = await api.getRevenueByDateRange(from, to);
      const canvas = document.getElementById('revenueCanvas');
      const container = document.getElementById('revenueChartContainer');
      if (!canvas || !container) return;

      destroyChart('revenue');

      if (!revenueData || revenueData.length === 0) {
        container.innerHTML = '<div class="text-center text-muted w-full" style="padding-top:80px;">Chưa có dữ liệu doanh thu trong khoảng thời gian này</div>';
        return;
      }

      // Re-create canvas if container had empty state text
      if (!document.getElementById('revenueCanvas')) {
        container.innerHTML = '<canvas id="revenueCanvas"></canvas>';
      }

      const ctx = document.getElementById('revenueCanvas').getContext('2d');
      const labels = revenueData.map(d => {
        const parts = d.date.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d.date;
      });
      const revenues = revenueData.map(d => d.revenue);
      const orders = revenueData.map(d => d.order_count);

      if (typeof Chart !== 'undefined') {
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0.35)');
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0.01)');

        chartInstances.revenue = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Doanh thu (₫)',
              data: revenues,
              borderColor: '#00d4ff',
              borderWidth: 2.5,
              backgroundColor: gradient,
              fill: true,
              tension: 0.35,
              pointBackgroundColor: '#00d4ff',
              pointBorderColor: '#ffffff',
              pointRadius: 4,
              pointHoverRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#f8fafc',
                bodyColor: '#94a3b8',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                padding: 10,
                callbacks: {
                  label: (ctx) => {
                    const idx = ctx.dataIndex;
                    return ` Doanh thu: ${formatCurrency(ctx.raw)} (${orders[idx] || 0} đơn)`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#94a3b8', font: { size: 11 } }
              },
              y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: {
                  color: '#94a3b8',
                  font: { size: 11 },
                  callback: (v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
                }
              }
            }
          }
        });
      }
    } catch (err) {
      console.error('Revenue chart error:', err);
    }
  }

  async function loadHourlyChart(from, to) {
    try {
      hourlyData = await api.getHourlySales(from, to);
      const canvas = document.getElementById('hourlyCanvas');
      const container = document.getElementById('hourlyChartContainer');
      if (!canvas || !container) return;

      destroyChart('hourly');

      if (!hourlyData || hourlyData.length === 0) {
        container.innerHTML = '<div class="text-center text-muted w-full" style="padding-top:80px;">Chưa có dữ liệu khung giờ</div>';
        return;
      }

      if (!document.getElementById('hourlyCanvas')) {
        container.innerHTML = '<canvas id="hourlyCanvas"></canvas>';
      }

      const maxRevenue = Math.max(...hourlyData.map(d => d.revenue), 1);
      const peakItem = hourlyData.find(d => d.revenue > 0 && d.revenue === maxRevenue);
      const peakBadge = document.getElementById('hourlyPeakBadge');
      if (peakBadge) {
        peakBadge.textContent = peakItem ? `Giờ đỉnh điểm: ${peakItem.hour}h (${formatCurrency(peakItem.revenue)})` : 'Giờ cao điểm';
      }

      const ctx = document.getElementById('hourlyCanvas').getContext('2d');
      const labels = hourlyData.map(d => `${d.hour}h`);
      const revenues = hourlyData.map(d => d.revenue);
      const orders = hourlyData.map(d => d.order_count);
      const bgColors = hourlyData.map(d => (d.revenue > 0 && d.revenue === maxRevenue) ? '#f59e0b' : '#38bdf8');

      if (typeof Chart !== 'undefined') {
        chartInstances.hourly = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Doanh thu (₫)',
              data: revenues,
              backgroundColor: bgColors,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                padding: 10,
                callbacks: {
                  label: (ctx) => {
                    const idx = ctx.dataIndex;
                    return ` Doanh thu: ${formatCurrency(ctx.raw)} (${orders[idx] || 0} đơn)`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  color: '#94a3b8',
                  font: { size: 10 },
                  callback: (v, idx) => (idx % 3 === 0 ? labels[idx] : '')
                }
              },
              y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: {
                  color: '#94a3b8',
                  font: { size: 10 },
                  callback: (v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
                }
              }
            }
          }
        });
      }
    } catch (err) {
      console.error('Hourly chart error:', err);
    }
  }

  async function loadTopProducts(from, to) {
    try {
      topProductsData = await api.getTopProducts(8, from, to);
      const el = document.getElementById('topProductsChart');
      if (!el) return;

      if (!topProductsData || topProductsData.length === 0) {
        el.innerHTML = '<div class="text-center text-muted" style="padding:20px;">Chưa có dữ liệu sản phẩm</div>';
        return;
      }

      const maxQty = Math.max(...topProductsData.map(d => d.total_quantity), 1);

      el.innerHTML = topProductsData.map((d, i) => `
        <div class="flex items-center gap-md" style="padding:8px 0; border-bottom:1px solid var(--border-light);">
          <span class="fw-700 text-muted" style="width:24px;">#${i + 1}</span>
          <div style="flex:1;">
            <div class="fw-600" style="font-size:13px;">${escapeHtml(d.product_name)}</div>
            <div style="margin-top:4px; height:6px; background:var(--bg-input); border-radius:3px; overflow:hidden;">
              <div style="height:100%; width:${(d.total_quantity / maxQty) * 100}%; background:linear-gradient(90deg, #3b82f6, #00d4ff); border-radius:3px;"></div>
            </div>
          </div>
          <div class="text-right" style="min-width:80px;">
            <div class="fw-700">${d.total_quantity} sp</div>
            <div class="text-muted" style="font-size:11px;">${formatCurrency(d.total_revenue)}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Top products error:', err);
    }
  }

  async function loadPaymentBreakdown(from, to) {
    try {
      paymentData = await api.getRevenueByPaymentMethod(from, to);
      const canvas = document.getElementById('paymentCanvas');
      const legendList = document.getElementById('paymentLegendList');
      if (!canvas || !legendList) return;

      destroyChart('payment');

      const labelsMap = {
        cash: 'Tiền mặt',
        transfer: 'Chuyển khoản (VietQR)',
        card: 'Thẻ ngân hàng',
        momo: 'Ví MoMo',
        zalopay: 'ZaloPay'
      };
      const colorsMap = {
        cash: '#10b981',
        transfer: '#3b82f6',
        card: '#06b6d4',
        momo: '#a855f7',
        zalopay: '#f59e0b'
      };

      const totalRevenue = paymentData.reduce((s, d) => s + d.revenue, 0) || 1;

      if (!paymentData || paymentData.length === 0) {
        legendList.innerHTML = '<div class="text-muted">Chưa có giao dịch thanh toán nào</div>';
        return;
      }

      const chartLabels = paymentData.map(d => labelsMap[d.payment_method] || d.payment_method);
      const chartValues = paymentData.map(d => d.revenue);
      const chartColors = paymentData.map(d => colorsMap[d.payment_method] || '#64748b');

      if (typeof Chart !== 'undefined') {
        const ctx = canvas.getContext('2d');
        chartInstances.payment = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: chartLabels,
            datasets: [{
              data: chartValues,
              backgroundColor: chartColors,
              borderWidth: 2,
              borderColor: '#1e293b'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                padding: 10,
                callbacks: {
                  label: (ctx) => ` ${formatCurrency(ctx.raw)} (${((ctx.raw / totalRevenue) * 100).toFixed(1)}%)`
                }
              }
            }
          }
        });
      }

      legendList.innerHTML = paymentData.map(d => {
        const pct = ((d.revenue / totalRevenue) * 100).toFixed(1);
        const color = colorsMap[d.payment_method] || '#64748b';
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block;"></span>
              <span style="font-size:13px; font-weight:600;">${labelsMap[d.payment_method] || d.payment_method}</span>
            </div>
            <div style="text-align:right;">
              <span style="font-size:13px; font-weight:700;">${formatCurrency(d.revenue)}</span>
              <span class="text-muted" style="font-size:11px; margin-left:6px;">(${pct}%)</span>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Payment breakdown error:', err);
    }
  }

  // ==================== EXPORT EXCEL / CSV ====================
  function exportCSV() {
    const from = document.getElementById('reportFrom')?.value || '';
    const to = document.getElementById('reportTo')?.value || '';

    let csv = '';
    csv += `BÁO CÁO DOANH THU & LỢI NHUẬN SHOP\r\n`;
    csv += `Thời gian: Từ ${from} đến ${to}\r\n`;
    csv += `Ngày xuất báo cáo: ${new Date().toLocaleString('vi-VN')}\r\n\r\n`;

    // 1. Profit Summary
    csv += `=== TỔNG HỢP LỢI NHUẬN GỘP ===\r\n`;
    csv += `Chỉ số,Giá trị (VNĐ)\r\n`;
    if (profitData) {
      csv += `Tổng doanh thu bán hàng,${profitData.grossRevenue}\r\n`;
      csv += `Tiền hoàn trả khách (${profitData.returnCount} phiếu),${profitData.totalRefund}\r\n`;
      csv += `Doanh thu thuần,${profitData.netRevenue}\r\n`;
      csv += `Giá vốn hàng bán (COGS),${profitData.totalCost}\r\n`;
      csv += `Lợi nhuận gộp,${profitData.grossProfit}\r\n`;
      csv += `Tỷ suất lợi nhuận (%),${profitData.profitMargin}%\r\n`;
    }
    csv += `\r\n`;

    // 2. Revenue by Date
    csv += `=== DOANH THU THEO NGÀY ===\r\n`;
    csv += `Ngày,Số đơn hàng,Doanh thu (VNĐ)\r\n`;
    (revenueData || []).forEach(r => {
      csv += `"${r.date}",${r.order_count},${r.revenue}\r\n`;
    });
    csv += `\r\n`;

    // 3. Top Products
    csv += `=== TOP SẢN PHẨM BÁN CHẠY ===\r\n`;
    csv += `Thứ tự,Tên sản phẩm,Số lượng bán,Doanh thu (VNĐ)\r\n`;
    (topProductsData || []).forEach((p, i) => {
      csv += `${i + 1},"${p.product_name.replace(/"/g, '""')}",${p.total_quantity},${p.total_revenue}\r\n`;
    });
    csv += `\r\n`;

    // 4. Hourly Sales
    csv += `=== DOANH SỐ THEO KHUNG GIỜ ===\r\n`;
    csv += `Khung giờ,Số đơn hàng,Doanh thu (VNĐ)\r\n`;
    (hourlyData || []).forEach(h => {
      csv += `"${h.hour}h - ${h.hour + 1}h",${h.order_count},${h.revenue}\r\n`;
    });

    // Create Blob with UTF-8 BOM so Excel opens with Vietnamese diacritics
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BaoCao_Shop_${from}_den_${to}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('success', 'Đã xuất file Excel/CSV', `File: BaoCao_Shop_${from}_den_${to}.csv`);
  }

  // ==================== EXPORT / PRINT PDF ====================
  async function exportPDF() {
    const from = document.getElementById('reportFrom')?.value || '';
    const to = document.getElementById('reportTo')?.value || '';
    const settings = await api.getAllSettings();
    const shopName = settings.shop_name || 'Shop';

    const p = profitData || { netRevenue: 0, grossRevenue: 0, totalCost: 0, grossProfit: 0, profitMargin: 0, totalRefund: 0, returnCount: 0 };

    const printWin = window.open('', '_blank', 'width=900,height=750');
    if (!printWin) {
      showToast('error', 'Lỗi', 'Trình duyệt đã chặn popup. Vui lòng cho phép popup để in PDF.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <title>Báo Cáo Doanh Thu & Lợi Nhuận - ${shopName}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #111; margin: 20px; font-size: 13px; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
          .shop-title { font-size: 20px; font-weight: bold; text-transform: uppercase; }
          .report-title { font-size: 16px; font-weight: bold; color: #364e68; margin-top: 4px; }
          .sub { font-size: 12px; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
          th { background: #f8fafc; font-weight: 600; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .highlight { background: #f0fdf4; font-weight: bold; }
          .footer-sign { display: flex; justify-content: space-between; margin-top: 40px; padding: 0 40px; }
          @media print {
            body { margin: 0; }
            button { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="shop-title">${escapeHtml(shopName)}</div>
          <div class="report-title">BÁO CÁO KINH DOANH & LỢI NHUẬN GỘP</div>
          <div class="sub">Khoảng thời gian: <strong>${formatDateOnly(from)}</strong> đến <strong>${formatDateOnly(to)}</strong></div>
          <div class="sub">Ngày lập báo cáo: ${new Date().toLocaleString('vi-VN')}</div>
        </div>

        <h3>1. Tổng hợp Lợi Nhuận Gộp</h3>
        <table>
          <tr><th>Chỉ tiêu tài chính</th><th class="text-right">Giá trị (VNĐ)</th><th>Ghi chú</th></tr>
          <tr><td>Tổng doanh thu bán hàng (Gross)</td><td class="text-right bold">${formatNumber(p.grossRevenue)}₫</td><td>Toàn bộ đơn hoàn thành</td></tr>
          <tr><td>Tiền hoàn trả khách</td><td class="text-right bold" style="color:#ef4444;">-${formatNumber(p.totalRefund)}₫</td><td>${p.returnCount} lượt đổi trả</td></tr>
          <tr class="highlight"><td>Doanh thu thuần (Net Revenue)</td><td class="text-right bold text-cyan">${formatNumber(p.netRevenue)}₫</td><td>Sau khi trừ hoàn trả</td></tr>
          <tr><td>Giá vốn hàng bán (COGS)</td><td class="text-right bold">${formatNumber(p.totalCost)}₫</td><td>Chi phí nhập hàng</td></tr>
          <tr class="highlight" style="background:#dcfce7; font-size:14px;">
            <td><strong>LỢI NHUẬN GỘP (GROSS PROFIT)</strong></td>
            <td class="text-right bold" style="color:#15803d;">${formatNumber(p.grossProfit)}₫</td>
            <td>Tỷ suất: <strong>${p.profitMargin}%</strong></td>
          </tr>
        </table>

        <h3>2. Chi tiết Doanh Thu Theo Ngày</h3>
        <table>
          <thead><tr><th>Ngày</th><th class="text-right">Số đơn hàng</th><th class="text-right">Doanh thu</th></tr></thead>
          <tbody>
            ${(revenueData || []).map(r => `
              <tr><td>${r.date}</td><td class="text-right">${r.order_count}</td><td class="text-right bold">${formatNumber(r.revenue)}₫</td></tr>
            `).join('')}
          </tbody>
        </table>

        <h3>3. Top Sản Phẩm Bán Chạy Nhất</h3>
        <table>
          <thead><tr><th style="width:50px;">Hạng</th><th>Tên sản phẩm</th><th class="text-right">SL bán</th><th class="text-right">Doanh số</th></tr></thead>
          <tbody>
            ${(topProductsData || []).map((prod, idx) => `
              <tr><td>#${idx + 1}</td><td>${escapeHtml(prod.product_name)}</td><td class="text-right bold">${prod.total_quantity}</td><td class="text-right">${formatNumber(prod.total_revenue)}₫</td></tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer-sign">
          <div style="text-align:center;">
            <strong>Người lập biểu</strong><br><br><br>
            <em>(Ký, ghi rõ họ tên)</em>
          </div>
          <div style="text-align:center;">
            <strong>Chủ cửa hàng / Giám đốc</strong><br><br><br>
            <em>(Ký, đóng dấu)</em>
          </div>
        </div>

        <div style="text-align:center; margin-top:30px;">
          <button onclick="window.print()" style="padding:10px 20px; font-size:14px; font-weight:bold; background:#364e68; color:white; border:none; border-radius:6px; cursor:pointer;">
            🖨️ In Báo Cáo / Lưu PDF
          </button>
        </div>
      </body>
      </html>
    `;

    printWin.document.write(html);
    printWin.document.close();
    showToast('info', 'Mở bản in báo cáo PDF thành công');
  }

  function setTextContent(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function formatDateOnly(dStr) {
    if (!dStr) return '';
    try {
      const parts = dStr.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch (_) {}
    return dStr;
  }

  function formatNumber(num) {
    if (!num && num !== 0) return '0';
    return new Intl.NumberFormat('vi-VN').format(Math.round(num));
  }

  async function loadABCAnalysis() {
    try {
      const tbody = document.getElementById('abcTableBody');
      if (!tbody) return;

      const items = await api.getABCProductAnalysis();
      if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Chưa có dữ liệu sản phẩm để phân tích</td></tr>';
        return;
      }

      let countA = 0, countB = 0, countC = 0;
      items.forEach(it => {
        if (it.abc_category === 'A') countA++;
        else if (it.abc_category === 'B') countB++;
        else countC++;
      });

      setTextContent('abcCountA', `${countA} sản phẩm`);
      setTextContent('abcCountB', `${countB} sản phẩm`);
      setTextContent('abcCountC', `${countC} sản phẩm`);

      tbody.innerHTML = items.map(p => {
        let badgeClass = 'badge-danger';
        let badgeText = 'Nhóm C';
        if (p.abc_category === 'A') {
          badgeClass = 'badge-success';
          badgeText = '⭐ Nhóm A';
        } else if (p.abc_category === 'B') {
          badgeClass = 'badge-cyan';
          badgeText = '✨ Nhóm B';
        }

        const daysText = p.days_of_stock >= 900 ? 'Vô hạn (chưa bán)' : `${p.days_of_stock} ngày`;
        const daysColor = p.days_of_stock <= 7 ? 'var(--danger)' : (p.days_of_stock <= 14 ? 'var(--warning)' : 'inherit');

        return `
          <tr>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td><code>${p.barcode || p.sku || '—'}</code></td>
            <td style="text-align:right;">${formatNumber(p.total_sold)}</td>
            <td style="text-align:right; font-weight:600;">${formatNumber(p.total_revenue)}₫</td>
            <td style="text-align:right;">${p.cumulative_percent}%</td>
            <td style="text-align:right; font-weight:700;">${formatNumber(p.stock)}</td>
            <td style="text-align:right; font-weight:600; color:${daysColor};">${daysText}</td>
            <td style="font-size:12px; color:var(--text-secondary);">${escapeHtml(p.ai_recommendation)}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('[ABCAnalysis] Error:', err);
    }
  }

  async function loadCashFlowReport(from, to) {
    try {
      const summary = await api.getCashFlowSummary(from, to);
      setTextContent('cfTotalIncome', `+${formatNumber(summary.total_income)}₫`);
      setTextContent('cfTotalExpense', `-${formatNumber(summary.total_expense)}₫`);
      setTextContent('cfNetCash', `${formatNumber(summary.net_cash)}₫`);

      const flows = await api.getCashFlows({ from, to, limit: 30 });
      const tbody = document.getElementById('cfTableBody');
      if (!tbody) return;

      if (!flows || flows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Chưa có phiếu thu chi nào trong kỳ này</td></tr>';
        return;
      }

      tbody.innerHTML = flows.map(f => `
        <tr>
          <td style="white-space:nowrap;">${f.created_at ? f.created_at.slice(0, 16) : '—'}</td>
          <td><span class="badge ${f.type === 'income' ? 'badge-success' : 'badge-danger'}">${f.type === 'income' ? 'Thu' : 'Chi'}</span></td>
          <td>${escapeHtml(f.category)}</td>
          <td style="text-align:right; font-weight:700; color:${f.type === 'income' ? 'var(--success)' : 'var(--danger)'};">
            ${f.type === 'income' ? '+' : '-'}${formatNumber(f.amount)}₫
          </td>
          <td class="text-secondary" style="font-size:11.5px;">${escapeHtml(f.note || '—')}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('[CashFlowReport] Error:', err);
    }
  }

  async function loadShiftsHistory() {
    try {
      const tbody = document.getElementById('shiftsTableBody');
      if (!tbody) return;

      const shifts = await api.getShifts(20);
      if (!shifts || shifts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Chưa có ca làm việc nào</td></tr>';
        return;
      }

      tbody.innerHTML = shifts.map(s => {
        const isOpen = s.status === 'open';
        let diffBadge = '—';
        if (!isOpen) {
          const diff = Number(s.difference) || 0;
          if (diff === 0) {
            diffBadge = `<span class="badge badge-success">Khớp 0₫</span>`;
          } else if (diff > 0) {
            diffBadge = `<span class="badge badge-cyan">+${formatNumber(diff)}₫</span>`;
          } else {
            diffBadge = `<span class="badge badge-danger">${formatNumber(diff)}₫</span>`;
          }
        }

        return `
          <tr>
            <td><strong>#${s.id}</strong></td>
            <td>${escapeHtml(s.staff_name || 'NV')}</td>
            <td style="white-space:nowrap; font-size:11px;">${s.start_time || '—'}</td>
            <td style="white-space:nowrap; font-size:11px;">${s.end_time || 'Đang mở'}</td>
            <td style="text-align:right;">${formatNumber(s.initial_cash)}₫</td>
            <td style="text-align:right; font-weight:600;">${isOpen ? '—' : `${formatNumber(s.actual_cash)}₫`}</td>
            <td style="text-align:right;">${diffBadge}</td>
            <td><span class="badge ${isOpen ? 'badge-warning' : 'badge-default'}">${isOpen ? 'Đang mở' : 'Đã đóng'}</span></td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('[ShiftsHistory] Error:', err);
    }
  }

  registerPage('reports', {
    render, init, loadAll, exportCSV, exportPDF, loadABCAnalysis, loadCashFlowReport, loadShiftsHistory
  });
})();
