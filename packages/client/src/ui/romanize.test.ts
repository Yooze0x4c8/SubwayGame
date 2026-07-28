import { describe, expect, it } from 'vitest';

import { romanize, romanizeStation } from './romanize.js';

describe('romanize', () => {
  it('romanizes plain station names', () => {
    expect(romanize('강남')).toBe('gangnam');
    expect(romanize('사당')).toBe('sadang');
    expect(romanize('교대')).toBe('gyodae');
    expect(romanize('역삼')).toBe('yeoksam');
    expect(romanize('신촌')).toBe('sinchon');
    expect(romanize('판교')).toBe('pangyo');
    expect(romanize('합정')).toBe('hapjeong');
    expect(romanize('공덕')).toBe('gongdeok');
    expect(romanize('방배')).toBe('bangbae');
  });

  it('applies ㄴ+ㄹ lateralization', () => {
    expect(romanize('신림')).toBe('sillim');
  });

  it('applies ㅇ+ㄹ nasalization', () => {
    expect(romanize('종로')).toBe('jongno');
  });

  it('applies ㅂ+ㄹ nasalization', () => {
    expect(romanize('왕십리')).toBe('wangsimni');
  });

  it('handles liaison into an empty onset', () => {
    expect(romanize('홍대입구')).toBe('hongdaeipgu');
    expect(romanize('이수')).toBe('isu');
  });

  it('romanizes long multi-syllable names', () => {
    expect(romanize('디지털미디어시티')).toBe('dijiteolmidieositi');
    expect(romanize('동대문')).toBe('dongdaemun');
    expect(romanize('문화')).toBe('munhwa');
  });

  it('passes non-Hangul characters through', () => {
    expect(romanize('GTX-A')).toBe('GTX-A');
    expect(romanize('4호선')).toBe('4hoseon');
    expect(romanize('')).toBe('');
  });
});

describe('romanizeStation', () => {
  it('capitalizes the first letter for signage display', () => {
    expect(romanizeStation('강남')).toBe('Gangnam');
    expect(romanizeStation('신림')).toBe('Sillim');
    expect(romanizeStation('왕십리')).toBe('Wangsimni');
  });

  it('returns an empty string for empty input', () => {
    expect(romanizeStation('')).toBe('');
  });
});
