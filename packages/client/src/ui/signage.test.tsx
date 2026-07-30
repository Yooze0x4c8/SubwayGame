import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LineBadge, lineNumber } from './signage.js';

afterEach(() => cleanup());

describe('numbered metro line labels', () => {
  it('keeps Seoul numbered lines as number discs', () => {
    expect(lineNumber('seoul_1')).toBe('1');
    expect(lineNumber('seoul_2')).toBe('2');
  });

  it('renders every regional numbered line with its unambiguous city name', () => {
    const regionalLines = [
      ['incheon_1', '인천 1호선'],
      ['incheon_2', '인천 2호선'],
      ['busan_1', '부산 1호선'],
      ['busan_2', '부산 2호선'],
      ['busan_3', '부산 3호선'],
      ['busan_4', '부산 4호선'],
      ['daegu_1', '대구 1호선'],
      ['daegu_2', '대구 2호선'],
      ['daegu_3', '대구 3호선'],
      ['daejeon_1', '대전 1호선'],
      ['gwangju_1', '광주 1호선'],
    ] as const;

    for (const [lineId] of regionalLines) {
      expect(lineNumber(lineId)).toBeNull();
    }

    render(
      <>
        {regionalLines.map(([lineId]) => (
          <LineBadge key={lineId} lineId={lineId} />
        ))}
      </>,
    );

    for (const [, label] of regionalLines) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
