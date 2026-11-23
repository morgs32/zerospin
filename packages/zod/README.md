# @zerospin/zod

Convert Zerospin `IShape` descriptors to Zod object schemas.

```ts
import { primitives } from '@zerospin/shapes';
import { makeZodSchema } from '@zerospin/zod';
import { z } from 'zod';

const User = makeZodSchema({
  id: primitives.id({ abbreviation: 'usr', primaryKey: true }),
  name: primitives.text(),
});

type IUser = z.infer<typeof User>;
User.parse({ id: 'usr_abc', name: 'Ada' });
```

The adapter validates **already decoded** values against each descriptor's
canonical Effect Type schema. JSON attributes accept the decoded domain value,
including nested Dates and refinements; they do not decode a persisted JSON
string or reconstruct transforms from JSON Schema. Scalar and nullable/default
policies are shared with shapes, including safe integers, finite numbers and a
fresh Date for each omitted Date default. Zod objects retain their normal object
key handling.

Type validation must complete synchronously without required services. An
asynchronous Type codec is interrupted and refused explicitly; a missing
service is likewise an unsupported Type-codec issue. Ordinary validation issues
become Zod issues. Unrelated defects, interruption and mixed Causes retain their
execution meaning.
