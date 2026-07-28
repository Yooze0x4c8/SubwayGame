import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LineBadge, lineNumber } from './signage.js';

afterEach(() => cleanup());

describe('Incheon line labels', () => {
  it('keeps Seoul numbered lines as number discs', () => {
    expect(lineNumber('seoul_1')).toBe('1');
    expect(lineNumber('seoul_2')).toBe('2');
  });

  it('renders Incheon lines with their unambiguous full names', () => {
    expect(lineNumber('incheon_1')).toBeNull();
    expect(lineNumber('incheon_2')).toBeNull();

    render(
      <>
        <LineBadge lineId="incheon_1" />
        <LineBadge lineId="incheon_2" />
      </>,
    );

    expect(screen.getByText('인천1호선')).toBeTruthy();
    expect(screen.getByText('인천2호선')).toBeTruthy();
  });
});
