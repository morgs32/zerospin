import { useSession, useLiveQuery } from '@zerospin/react';

import { CartItemQuantityControls } from './CartItemQuantityControls';
import { CheckoutButton } from './CheckoutButton';
import { PromotionControls } from './PromotionControls';
import { PurchasePromotionStatus } from './PurchasePromotionStatus';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';
import { shopperSessionDefinition } from '@/zerospin/shopperSessionDefinition';

export function ShoppingCartSidebar() {
  const shopperSession = useSession(shopperSessionDefinition);
  const { data: cart } = useLiveQuery({
    session: shopperSession,
    query: db =>
      db.query.cart.findFirst({
        with: { items: true, checkoutPurchase: true },
      }),
  });

  const cartItems = cart?.items ?? [];

  return (
    <Sidebar side="right" collapsible="offcanvas">
      <SidebarHeader className="gap-2 border-b border-sidebar-border p-4">
        <span className="text-lg font-semibold">Cart</span>
        <span className="text-muted-foreground text-xs leading-snug">
          Review and update your cart (demo).
        </span>
      </SidebarHeader>
      <SidebarContent className="min-w-0 overflow-y-auto">
        <div className="flex min-w-0 flex-col gap-2 p-3">
          {cartItems.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm leading-relaxed">
              Your cart is empty. Add products from the catalog.
            </p>
          ) : (
            <div className="space-y-2">
              {cartItems.map(cartItem => (
                <div
                  key={cartItem.id}
                  className="bg-background flex min-w-0 flex-col gap-2 rounded-md border border-sidebar-border/40 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{cartItem.name}</p>
                  </div>
                  <CartItemQuantityControls
                    quantity={cartItem.quantity}
                    cartItemId={cartItem.id}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </SidebarContent>
      <SidebarFooter className="shrink-0 border-t border-sidebar-border p-4">
        {cartItems.length > 0 ? (
          <p className="text-right text-base font-semibold tabular-nums">
            Subtotal:{' '}
            {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(
              cartItems.reduce(
                (acc, cartItem) => acc + cartItem.price * cartItem.quantity,
                0,
              ) / 100,
            )}
          </p>
        ) : null}
        <PromotionControls />
        <CheckoutButton />
        {cart?.checkoutPurchaseId ? (
          <PurchasePromotionStatus purchaseId={cart.checkoutPurchaseId} />
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
