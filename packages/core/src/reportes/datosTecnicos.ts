/**
 * Navegador y sistema operativo para un reporte, sin identidad: solo el nombre y la versión
 * principal, nunca el user agent entero (que ayuda a identificar un dispositivo).
 */
export interface DatosTecnicos {
  navegador: string;
  sistema: string;
}

const NAVEGADORES: [RegExp, string][] = [
  [/Edg(?:A|iOS)?\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
  [/(?:CriOS|Chrome)\/(\d+)/, "Chrome"],
  [/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/, "Safari"],
];

function navegador(ua: string): string {
  for (const [patron, nombre] of NAVEGADORES) {
    const version = patron.exec(ua)?.[1];
    if (version) return `${nombre} ${version}`;
  }
  return "Otro";
}

function sistema(ua: string): string {
  const ios = /(?:iPhone|iPad|iPod).* OS (\d+)_/.exec(ua);
  if (ios) return `iOS ${ios[1]}`;
  const android = /Android (\d+)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  if (/Windows NT/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  // macOS congela la versión en el user agent (10_15_7): no sirve para nada más que el nombre.
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Otro";
}

export function describirDispositivo(userAgent: string): DatosTecnicos {
  return { navegador: navegador(userAgent), sistema: sistema(userAgent) };
}
