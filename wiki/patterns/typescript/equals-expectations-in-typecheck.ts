import { PrimitiveKind, type IPrimitiveDescriptor } from '@zerospin/shapes';
import { assert, type Equals } from 'tsafe';

/**
 * Inline Expected shape inside Equals — no file-local alias used only once.
 *
 * @bad Do not introduce a file-local `IPropertiesStructural` alias used by only this equality assertion.
 */
assert<
  Equals<
    IProperties,
    {
      id: {
        kind: PrimitiveKind.Id;
        abbreviation: string;
        primaryKey: true;
        nullable: false;
      };
      modelName: { kind: PrimitiveKind.Text; nullable: false };
      createdAt: { kind: PrimitiveKind.Date; nullable: false };
      updatedAt: { kind: PrimitiveKind.Date; nullable: false };
      version: { kind: PrimitiveKind.Text; nullable: false };
    } & Record<string, IPrimitiveDescriptor>
  >
>();

declare type IProperties = unknown;
