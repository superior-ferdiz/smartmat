import { describe, expect, it } from 'vitest';
import { loginPathFor, safeNextPath } from './safeNextPath';

describe('safeNextPath (no open redirect after login)', () => {
  it('keeps paths inside the app, with query and hash', () => {
    expect(safeNextPath('/matlager')).toBe('/matlager');
    expect(safeNextPath('/matlager?sted=kjoleskap#top')).toBe('/matlager?sted=kjoleskap#top');
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'matlager',
    '/\tevil',
    ' /matlager',
  ])('turns %j into "/"', (value) => {
    expect(safeNextPath(value)).toBe('/');
  });

  it('builds the login link, without ?neste for the front page', () => {
    expect(loginPathFor('/logg-inn', '/')).toBe('/logg-inn');
    expect(loginPathFor('/logg-inn', '/matlager?x=1')).toBe('/logg-inn?neste=%2Fmatlager%3Fx%3D1');
  });
});
