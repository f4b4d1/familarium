import { describe, expect, it } from 'vitest';
import { guessSex, parseBox } from './wortlaut.ts';

function einzel(text: string) {
  const box = parseBox([text]);
  expect(box.events).toHaveLength(1);
  return box.events[0]!;
}

describe('parseBox: einzelne Ereignisse', () => {
  it('* 7.6.1619: exaktes Datum, Wortlaut unverändert', () => {
    const e = einzel('* 7.6.1619');
    expect(e.type).toBe('birth');
    expect(e.verbatim).toBe('* 7.6.1619');
    expect(e.date).toEqual({ kind: 'exact', date: { year: 1619, month: 6, day: 7 } });
    expect(e.confidence).toBe('probable');
    expect(e.placeText).toBeUndefined();
    expect(e.cause).toBeUndefined();
  });

  it('† 16.7.1637 an Pest: Ursache, kein Ort', () => {
    const e = einzel('† 16.7.1637 an Pest');
    expect(e.type).toBe('death');
    expect(e.verbatim).toBe('† 16.7.1637 an Pest');
    expect(e.date).toEqual({ kind: 'exact', date: { year: 1637, month: 7, day: 16 } });
    expect(e.cause).toBe('Pest');
    expect(e.placeText).toBeUndefined();
    expect(e.confidence).toBe('probable');
  });

  it('† 8.10.1644 Eschenbrück: Ort', () => {
    const e = einzel('† 8.10.1644 Eschenbrück');
    expect(e.date).toEqual({ kind: 'exact', date: { year: 1644, month: 10, day: 8 } });
    expect(e.placeText).toBe('Eschenbrück');
    expect(e.cause).toBeUndefined();
  });

  it('* 28.8.1637/Rabenmoor: Ort nach Schrägstrich', () => {
    const e = einzel('* 28.8.1637/Rabenmoor');
    expect(e.verbatim).toBe('* 28.8.1637/Rabenmoor');
    expect(e.date).toEqual({ kind: 'exact', date: { year: 1637, month: 8, day: 28 } });
    expect(e.placeText).toBe('Rabenmoor');
  });
});

describe('parseBox: unscharfe Daten', () => {
  it('* ca 1560: about, assumed', () => {
    const e = einzel('* ca 1560');
    expect(e.date).toEqual({ kind: 'about', date: { year: 1560 } });
    expect(e.confidence).toBe('assumed');
  });

  it('† ? 1611 muss er schon tot sein: before 1611', () => {
    const e = einzel('† ? 1611 muss er schon tot sein');
    expect(e.date).toEqual({ kind: 'before', date: { year: 1611 } });
    expect(e.confidence).toBe('assumed');
    expect(e.verbatim).toBe('† ? 1611 muss er schon tot sein');
    expect(e.placeText).toBeUndefined();
  });

  it('* ? 1621: exact 1621, assumed', () => {
    const e = einzel('* ? 1621');
    expect(e.date).toEqual({ kind: 'exact', date: { year: 1621 } });
    expect(e.confidence).toBe('assumed');
  });

  it('† ?: kein Datum, unknown', () => {
    const e = einzel('† ?');
    expect(e.type).toBe('death');
    expect(e.date).toBeUndefined();
    expect(e.confidence).toBe('unknown');
    expect(e.placeText).toBeUndefined();
    expect(e.rest).toBeUndefined();
    expect(e.verbatim).toBe('† ?');
  });

  it('* : ? † : ?: zwei Ereignisse ohne Daten', () => {
    const box = parseBox(['* : ? † : ?']);
    expect(box.nameText).toBe('');
    expect(box.events).toHaveLength(2);
    expect(box.events.map((e) => e.type)).toEqual(['birth', 'death']);
    for (const e of box.events) {
      expect(e.date).toBeUndefined();
      expect(e.confidence).toBe('unknown');
    }
    expect(box.events[0]!.verbatim).toBe('* : ?');
    expect(box.events[1]!.verbatim).toBe('† : ?');
  });

  it('zweistelliges Jahr * 23.2.39 ergibt 1939', () => {
    const e = einzel('* 23.2.39');
    expect(e.date).toEqual({ kind: 'exact', date: { year: 1939, month: 2, day: 23 } });
  });
});

describe('parseBox: mehrere Zeilen', () => {
  it('Name vor dem ersten Zeichen landet in nameText', () => {
    const box = parseBox(['Konrad Zwiebelmann', '* 12 6 1628', '† 19.4. 1696', 'Rabenmoor']);
    expect(box.nameText).toBe('Konrad Zwiebelmann');
    expect(box.events).toHaveLength(2);
    const [geburt, tod] = box.events;
    expect(geburt!.type).toBe('birth');
    expect(geburt!.date).toEqual({ kind: 'exact', date: { year: 1628, month: 6, day: 12 } });
    expect(tod!.type).toBe('death');
    expect(tod!.date).toEqual({ kind: 'exact', date: { year: 1696, month: 4, day: 19 } });
    expect(tod!.placeText).toBe('Rabenmoor');
  });
});

describe('parseBox: Heirat', () => {
  it('⚭ 14.4.1801: Datum', () => {
    const e = einzel('⚭ 14.4.1801');
    expect(e.type).toBe('marriage');
    expect(e.date).toEqual({ kind: 'exact', date: { year: 1801, month: 4, day: 14 } });
    expect(e.placeText).toBeUndefined();
    expect(e.rest).toBeUndefined();
  });

  it('⚭ 13.5.1804/Eschenbrück: Ort', () => {
    const e = einzel('⚭ 13.5.1804/Eschenbrück');
    expect(e.date).toEqual({ kind: 'exact', date: { year: 1804, month: 5, day: 13 } });
    expect(e.placeText).toBe('Eschenbrück');
  });

  it('⚭ 5.2.1611 in Eschenbrück: Ort', () => {
    const e = einzel('⚭ 5.2.1611 in Eschenbrück');
    expect(e.date).toEqual({ kind: 'exact', date: { year: 1611, month: 2, day: 5 } });
    expect(e.placeText).toBe('Eschenbrück');
  });

  it('⚭ Hans Zwiebelmann: kein Datum, Text in rest', () => {
    const e = einzel('⚭ Hans Zwiebelmann');
    expect(e.date).toBeUndefined();
    expect(e.rest).toBe('Hans Zwiebelmann');
    expect(e.placeText).toBeUndefined();
    expect(e.confidence).toBe('unknown');
  });
});

describe('guessSex', () => {
  it.each([
    ['Anna', 'f'],
    ['Johann Christian', 'm'],
    ['2. Tochter totgeboren', 'f'],
    ['Maria, Witwe des Meisters Konrad', 'f'],
    ['Uwe', 'm'],
    ['Gottlieb', 'm'],
  ])('%s -> %s', (name, erwartet) => {
    expect(guessSex(name)).toBe(erwartet);
  });
});
