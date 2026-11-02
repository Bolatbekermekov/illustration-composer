import { describe, expect, it } from 'vitest';
import { MINT, PEACH } from '../domain/schemes.ts';
import { parsePalette, validateScheme } from './import.ts';

const MINT_FIGMA_SVG = `<svg width="1000" height="633" viewBox="0 0 1000 633" fill="none" xmlns="http://www.w3.org/2000/svg">
<g id="Group 2136136334">
<rect id="Rectangle 1_3" x="2644.41" y="2008.57" width="500" height="158.208" fill="#BEEBEB"/>
<rect id="Rectangle 4_3" x="3144.41" y="2008.57" width="500" height="158.208" fill="#FFD4F2"/>
<rect id="Rectangle 2_3" x="2644.41" y="2166.78" width="500" height="158.208" fill="#80DADA"/>
<rect id="Rectangle 5_3" x="3144.41" y="2166.78" width="500" height="158.208" fill="#6D7BFC"/>
<rect id="Rectangle 3_3" x="2644.41" y="2324.99" width="500" height="158.208" fill="#5ABEBE"/>
<rect id="Rectangle 6_3" x="3144.41" y="2324.99" width="500" height="158.208" fill="#B6C6FE"/>
<rect id="Rectangle 7_3" x="2644.41" y="2483.19" width="500" height="158.208" fill="#181817"/>
<path id="Rectangle 8_3" d="M3145.41 2484.19H3643.41V2640.4H3145.41V2484.19Z" fill="white" stroke-width="2" stroke="black"/>
</g>
</svg>`;

describe('parsePalette', () => {
  it('reads a Figma palette grid exported as SVG (left column = background, right = objects)', () => {
    const res = parsePalette(MINT_FIGMA_SVG, 'mint.svg');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scheme.colors).toEqual(MINT.colors);
  });

  it('reads a single-row swatch strip left → right', () => {
    const colors = ['#FDD7B9', '#FAC896', '#D27532', '#181817', '#F9ECB0', '#80DADA', '#BEEBEB', '#FFFFFF'];
    const rects = colors.map((c, i) => `<rect x="${i * 100}" y="0" width="100" height="100" fill="${c}"/>`).join('');
    const res = parsePalette(`<svg xmlns="http://www.w3.org/2000/svg">${rects}</svg>`, 'strip.svg');
    expect(res.ok && res.scheme.colors).toEqual(PEACH.colors);
  });

  it('reads JSON with background/objects arrays', () => {
    const json = JSON.stringify({
      name: 'Персик 2',
      background: ['#FDD7B9', '#FAC896', '#D27532'],
      objects: ['#F9ECB0', '#80DADA', '#BEEBEB'],
    });
    const res = parsePalette(json, 'peach.json');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.scheme.name).toBe('Персик 2');
    expect(res.scheme.colors).toEqual(PEACH.colors);
  });

  it('reads JSON keyed by role', () => {
    const res = parsePalette(JSON.stringify({ name: 'Mint', colors: MINT.colors }), 'x.json');
    expect(res.ok && res.scheme.colors).toEqual(MINT.colors);
  });

  it('reads a plain list of eight HEX codes in Figma grid order', () => {
    const text = '#BEEBEB #80DADA #5ABEBE #181817\n#FFD4F2, #6D7BFC, #B6C6FE, #FFFFFF';
    const res = parsePalette(text, 'mint.txt');
    expect(res.ok && res.scheme.colors).toEqual(MINT.colors);
  });

  it('fills ink and paper with defaults when only six colours are given', () => {
    const res = parsePalette('FDD7B9 FAC896 D27532 F9ECB0 80DADA BEEBEB', 'p.txt');
    expect(res.ok && res.scheme.colors).toEqual(PEACH.colors);
  });

  it('explains what is wrong with an unsupported number of colours', () => {
    const res = parsePalette('#111111 #222222 #333333 #444444 #555555 #666666 #777777', 'x.txt');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/6 или 8/);
  });

  it('rejects malformed JSON with a readable message', () => {
    const res = parsePalette('{"background": ["#FFF"', 'x.json');
    expect(res.ok).toBe(false);
  });
});

describe('validateScheme', () => {
  it('accepts the built-in schemes', () => {
    expect(validateScheme(MINT).errors).toEqual([]);
    expect(validateScheme(PEACH).errors).toEqual([]);
  });

  it('forbids an object colour that equals a background colour of the same scheme', () => {
    const bad = { ...MINT, colors: { ...MINT.colors, obj2: MINT.colors.bg2 } };
    const { errors } = validateScheme(bad);
    expect(errors.join(' ')).toMatch(/фон/i);
  });

  it('warns when the background ramp is not light → dark', () => {
    const swapped = { ...MINT, colors: { ...MINT.colors, bg1: MINT.colors.bg3, bg3: MINT.colors.bg1 } };
    expect(validateScheme(swapped).warnings.length).toBeGreaterThan(0);
  });
});
