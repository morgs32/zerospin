import type { IInferModelRow } from '@zerospin/core/models/types';
import {
  useSession,
  makeAggregateSessionModelId,
  stageAggregateSessionCommand,
  useLiveQuery,
  validateAggregateSessionCommand,
} from '@zerospin/react';
import { ShoppingCart } from 'lucide-react';

import { CartItemQuantityControls } from './CartItemQuantityControls';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cartV1 } from '@/zerospin/aggregates/user/models/cart/CartV1';
import { cartItemV1 } from '@/zerospin/aggregates/user/models/cartItem/CartItemV1';
import { type productV1 } from '@/zerospin/services/marketplace/models/product/ProductV1';
import { shopperSessionDefinition } from '@/zerospin/shopperSessionDefinition';

export function ProductCard(props: {
  product: IInferModelRow<typeof productV1>;
}) {
  const { product } = props;
  const shopperSession = useSession(shopperSessionDefinition);
  const { data: cart } = useLiveQuery({
    session: shopperSession,
    query: db =>
      db.query.cart.findFirst({
        with: { items: true, checkoutPurchase: true },
      }),
  });
  const cartItem = cart?.items.find(item => item.productId === product.id);

  return (
    <Card className="flex flex-col gap-0 overflow-hidden border-border/80 bg-card py-0 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="p-3 pb-6">
        <CardTitle className="text-base leading-snug">{product.name}</CardTitle>
        <CardDescription className="line-clamp-2">
          {product.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-0" />
      <CardFooter className="mt-auto flex flex-col items-stretch gap-3 border-t bg-muted/40 p-3 [.border-t]:pt-3">
        <span className="text-right font-mono text-lg font-semibold leading-none tabular-nums">
          ${(product.price / 100).toFixed(2)}
        </span>
        {cartItem ? (
          <CartItemQuantityControls
            quantity={cartItem.quantity}
            cartItemId={cartItem.id}
          />
        ) : (
          <Button
            disabled={
              validateAggregateSessionCommand({
                session: shopperSession,
                contractName: 'addToCart',
                payload: {
                  newCartId: 'crt_preview',
                  newCartItemId: 'cit_preview',
                  product,
                  quantity: 1,
                },
              })._tag === 'Failure'
            }
            className="self-end"
            size="sm"
            variant="outline"
            onClick={() => {
              stageAggregateSessionCommand({
                session: shopperSession,
                contractName: 'addToCart',
                payload: {
                  newCartId: makeAggregateSessionModelId({
                    session: shopperSession,
                    model: cartV1,
                  }),
                  newCartItemId: makeAggregateSessionModelId({
                    session: shopperSession,
                    model: cartItemV1,
                  }),
                  product,
                  quantity: 1,
                },
              });
            }}
          >
            <ShoppingCart className="mr-1.5 h-4 w-4" />
            Add to cart
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
