/* ============================================
   ShopPro Plugin: Customer Display
   Syncs live cart info to customer-facing view
   ============================================ */

class CustomerDisplayPlugin {
  constructor() {
    this.name = 'Customer Display';
    this.context = null;
    this.lastState = { itemCount: 0, total: 0 };
  }

  onInit(context) {
    this.context = context;
    console.log('[Plugin: CustomerDisplay] Customer pole display driver initialized');
  }

  onCartUpdated(cart, total) {
    this.lastState = {
      itemCount: Array.isArray(cart) ? cart.length : 0,
      total: total || 0,
      updatedAt: new Date().toISOString()
    };
    return {
      synced: true,
      displayLine1: `Tong tien: ${Number(total || 0).toLocaleString('vi-VN')} d`,
      displayLine2: `So mon: ${this.lastState.itemCount}`
    };
  }

  onOrderCreated(order) {
    return {
      orderId: order ? order.id : null,
      message: 'Cam on quy khach da mua hang!'
    };
  }

  onDestroy() {
    console.log('[Plugin: CustomerDisplay] Destroyed');
  }
}

module.exports = CustomerDisplayPlugin;
