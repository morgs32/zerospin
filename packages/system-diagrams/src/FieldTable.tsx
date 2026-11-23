import type { IModelSpec } from '@zerospin/core/models/types';
import { mapValues } from 'es-toolkit';

import { CompactTable } from './CompactTable.js';

export function FieldTable({
  properties,
  label,
}: {
  properties: IModelSpec['propertiesShape'];
  label: string;
}) {
  return (
    <CompactTable aria-label={label} framed={false}>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Type</th>
          <th scope="col">Nullable</th>
          <th scope="col">Primary key</th>
          <th scope="col">Unique</th>
          <th scope="col">Default</th>
          <th scope="col">References</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(
          mapValues(properties, (field, name) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>
                {field.kind}
                {'values' in field && (
                  <span className="system-board-field-detail">
                    {field.values.join(', ')}
                  </span>
                )}
                {'abbreviation' in field && (
                  <span className="system-board-field-detail">
                    {field.abbreviation}
                  </span>
                )}
              </td>
              <td>{String(field.nullable)}</td>
              <td>{String(field.primaryKey)}</td>
              <td>{String(field.unique)}</td>
              <td>
                {'defaultValue' in field && field.defaultValue !== undefined
                  ? JSON.stringify(field.defaultValue)
                  : '—'}
              </td>
              <td>
                {'references' in field && field.references ? (
                  <>
                    {field.references.tableName}.{field.references.columnName}
                    <span className="system-board-field-detail">
                      {field.references.relation} / {field.references.inverse}
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          )),
        )}
        {Object.keys(properties).length === 0 && (
          <tr>
            <td colSpan={7}>No fields declared.</td>
          </tr>
        )}
      </tbody>
    </CompactTable>
  );
}
