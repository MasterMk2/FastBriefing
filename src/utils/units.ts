// 単位系の表示整形。値の保持は正規化層 (MissionNormalizer) が担い、
// ここでは選択された単位に「一度だけ」換算して文字列化する。

export function formatAltitude(meters: number, unit: 'ft' | 'm'): string {
  if (unit === 'ft') {
    return `${Math.round(meters * 3.28084)} ft`;
  }
  return `${Math.round(meters)} m`;
}

export function formatSpeed(ms: number, unit: 'kt' | 'kmh'): string {
  if (unit === 'kt') {
    return `${Math.round(ms * 1.94384)} kt`;
  }
  return `${Math.round(ms * 3.6)} km/h`;
}

export function formatDistance(meters: number, unit: 'nm' | 'km'): string {
  if (unit === 'nm') {
    return `${(meters / 1852).toFixed(1)} nm`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatPressure(mmHg: number, unit: 'hPa' | 'inHg' | 'mmHg'): string {
  switch (unit) {
    case 'hPa':
      return `${(mmHg * 1.33322).toFixed(1)} hPa`;
    case 'inHg':
      return `${(mmHg * 0.0393701).toFixed(2)} inHg`;
    case 'mmHg':
      return `${mmHg.toFixed(1)} mmHg`;
  }
}

export function formatTemperature(celsius: number, unit: 'C' | 'F'): string {
  if (unit === 'F') {
    return `${(celsius * 9 / 5 + 32).toFixed(1)}°F`;
  }
  return `${celsius.toFixed(1)}°C`;
}

export function windFromTo(dirTo: number): { from: number; to: number } {
  const from = (dirTo + 180) % 360;
  return { from, to: dirTo };
}
