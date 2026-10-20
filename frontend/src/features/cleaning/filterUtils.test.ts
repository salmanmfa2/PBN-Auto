import test from 'node:test';
import assert from 'node:assert/strict';

import { filterTableRows } from './filterUtils.ts';

test('filterTableRows applies exact and contains matches case insensitively', () => {
  const rows = [
    { Name: 'Alice', Status: 'Active' },
    { Name: 'Bob', Status: 'Inactive' },
    { Name: 'Charlie', Status: 'Active' },
  ];

  assert.deepEqual(filterTableRows(rows, { Name: 'ali' }, 'contains'), [rows[0]]);
  assert.deepEqual(filterTableRows(rows, { Status: 'active' }, 'equals'), [rows[0], rows[2]]);
});

test('filterTableRows includes any checked value and supports blank cells', () => {
  const rows = [
    { Name: 'Alice', Status: 'Active' },
    { Name: 'Bob', Status: 'Inactive' },
    { Name: 'Cara', Status: 'Active' },
    { Name: '', Status: 'Inactive' },
  ];

  assert.deepEqual(filterTableRows(rows, { Name: ['alice', 'CARA'] }), [rows[0], rows[2]]);
  assert.deepEqual(filterTableRows(rows, { Name: [''] }), [rows[3]]);
  assert.deepEqual(filterTableRows(rows, { Name: [] }), []);
});
