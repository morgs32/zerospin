import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompactTable } from '@zerospin/system-diagrams';
import '@zerospin/system-diagrams/styles.css';

const meta = {
  title: 'Studio/CompactTable',
  component: CompactTable,
  decorators: [
    Story => (
      <div style={{ padding: 8, background: '#f4f4f4', minHeight: '100vh' }}>
        <div style={{ maxWidth: 1000 }}>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof CompactTable>;

export default meta;
type IStory = StoryObj<typeof meta>;

export const Payments: IStory = {
  render: () => (
    <CompactTable aria-label="Payment lines">
      <thead>
        <tr>
          <th scope="col" style={{ width: '12ch' }}>
            Line
          </th>
          <th scope="col">Account</th>
          <th scope="col" data-align="right">
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {[
          {
            line: 'settlement',
            account: 'assets/payments',
            amount: '38,000.00 USD',
            icon: 'A',
            color: '#43d714',
          },
          {
            line: 'receivable',
            account: 'assets/receivable:inv_4821',
            amount: '-38,000.00 USD',
            icon: 'A',
            color: '#43d714',
          },
          {
            line: 'fee',
            account: 'expenses/payment-fees',
            amount: '1,102.00 USD',
            icon: 'E',
            color: '#e2c900',
          },
          {
            line: 'fee-payable',
            account: 'liabilities/payable:processor',
            amount: '-1,102.00 USD',
            icon: 'L',
            color: '#ff3636',
          },
        ].map(row => (
          <tr key={row.line}>
            <th scope="row">{row.line}</th>
            <td>
              <span className="compact-table-account">
                <span
                  className="compact-table-account-icon"
                  style={{ background: row.color }}
                  aria-hidden="true"
                >
                  {row.icon}
                </span>
                {row.account}
              </span>
            </td>
            <td data-align="right">{row.amount}</td>
          </tr>
        ))}
      </tbody>
    </CompactTable>
  ),
};

function FieldMetadataTable({ framed = true }: { framed?: boolean } = {}) {
  return (
    <CompactTable aria-label="Channel v1 fields" framed={framed}>
      <thead>
        <tr>
          {[
            'Field',
            'Type',
            'Nullable',
            'Primary key',
            'Unique',
            'Default',
            'References',
          ].map(name => (
            <th scope="col" key={name} style={{ whiteSpace: 'nowrap' }}>
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[
          ['id', 'string', 'false', 'true', 'true', '—', '—'],
          [
            'organizationId',
            'string',
            'false',
            'false',
            'false',
            '—',
            'organization.id (many / one)',
          ],
          ['name', 'string', 'false', 'false', 'false', '"Untitled"', '—'],
          [
            'status',
            'enum: open, closed',
            'false',
            'false',
            'false',
            '"open"',
            '—',
          ],
          ['archivedAt', 'number', 'true', 'false', 'false', '—', '—'],
        ].map(([name, ...values]) => (
          <tr key={name}>
            <th scope="row">{name}</th>
            {values.map((value, index) => (
              <td key={index}>{value}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </CompactTable>
  );
}

export const FieldMetadata: IStory = {
  render: () => <FieldMetadataTable />,
};

export const Narrow: IStory = {
  render: () => (
    <div style={{ width: 280, maxWidth: '100%' }}>
      <FieldMetadataTable />
    </div>
  ),
};

export const Unframed: IStory = {
  args: { framed: false },
  render: args => <FieldMetadataTable framed={args.framed ?? true} />,
};
