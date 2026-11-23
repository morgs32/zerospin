import type { IInferResource } from '@zerospin/core/models/types';
import {
  useSession,
  stageAggregateSessionCommand,
  validateAggregateSessionCommand,
} from '@zerospin/react';
import { Minus, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { type cartItemV1 } from '@/zerospin/aggregates/user/models/cartItem/CartItemV1';
import { shopperSessionDefinition } from '@/zerospin/shopperSessionDefinition';

interface IProps {
  cartItemId: IInferResource<typeof cartItemV1>['id'];
  quantity: number;
}

export function CartItemQuantityControls({ quantity, cartItemId }: IProps) {
  const shopperSession = useSession(shopperSessionDefinition);
  const removeFailure =
    validateAggregateSessionCommand({
      session: shopperSession,
      contractName: 'removeFromCart',
      payload: { id: cartItemId },
    })._tag === 'Failure';
  const quantityFailure = (nextQuantity: number) =>
    validateAggregateSessionCommand({
      session: shopperSession,
      contractName: 'updateCartItemQuantity',
      payload: { cartItemId, quantity: nextQuantity },
    })._tag === 'Failure';
  const remove = () =>
    stageAggregateSessionCommand({
      session: shopperSession,
      contractName: 'removeFromCart',
      payload: { id: cartItemId },
    });
  const setQuantity = (nextQuantity: number) =>
    stageAggregateSessionCommand({
      session: shopperSession,
      contractName: 'updateCartItemQuantity',
      payload: { cartItemId, quantity: nextQuantity },
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button
        disabled={quantity <= 1 ? removeFailure : quantityFailure(quantity - 1)}
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => (quantity <= 1 ? remove() : setQuantity(quantity - 1))}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="min-w-[2rem] text-center text-sm font-medium">
        {quantity}
      </span>
      <Button
        disabled={quantityFailure(quantity + 1)}
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => setQuantity(quantity + 1)}
      >
        <Plus className="h-3 w-3" />
      </Button>
      <Button
        disabled={removeFailure}
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={remove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
