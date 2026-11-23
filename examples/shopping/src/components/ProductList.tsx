import { useSession, useLiveQuery } from '@zerospin/react';

import { ProductCard } from './ProductCard';

import { catalogSessionDefinition } from '@/zerospin/catalogSessionDefinition';

export function ProductList() {
  const catalogSession = useSession(catalogSessionDefinition);
  const { data: products } = useLiveQuery({
    session: catalogSession,
    query: db => db.query.product.findMany(),
  });

  if (!products) {
    return null;
  }

  return (
    <section className="@container w-full space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">
          Products
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Browse the catalog and add items to your cart.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @xl:grid-cols-3 @5xl:grid-cols-4">
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
