/**
 * IndexedDB mínimo para jsdom, que no lo trae, y sin sumar una dependencia: alcanza para que los tests
 * pasen por el código real de `archivosLocales.ts`. No copia los valores como el navegador.
 */
type Valor = { sha256: string };

interface Pedido<T> {
  result: T;
  error: Error | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

let bases = new Map<string, Map<string, Valor>>();
let fallar: { operacion: string; base?: string } | null = null;

/** Hace fallar la próxima operación con ese nombre, para probar los avisos. */
export function hacerFallarIndexedDb(operacion: string, base?: string): void {
  fallar = { operacion, base };
}

export function basesDeIndexedDb(): string[] {
  return [...bases.keys()];
}

export function reiniciarIndexedDbFalso(): void {
  bases = new Map();
  fallar = null;
}

function crearBase(nombre: string) {
  const datos = bases.get(nombre) as Map<string, Valor>;
  return {
    result: null as unknown,
    createObjectStore: () => ({}),
    close: () => {},
    transaction: () => {
      const transaccion = {
        error: null as Error | null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => {
          const operar = <T>(operacion: string, hacer: () => T) => {
            const pedido = { result: undefined } as unknown as Pedido<T>;
            setTimeout(() => {
              if (fallar?.operacion === operacion && (!fallar.base || fallar.base === nombre)) {
                fallar = null;
                transaccion.error = new Error(`falló ${operacion}`);
                transaccion.onerror?.();
                return;
              }
              pedido.result = hacer();
              transaccion.oncomplete?.();
            });
            return pedido;
          };
          return {
            put: (valor: Valor) => operar("put", () => void datos.set(valor.sha256, valor)),
            get: (clave: string) => operar("get", () => datos.get(clave)),
            getAll: () => operar("getAll", () => [...datos.values()]),
            count: () => operar("count", () => datos.size),
            delete: (clave: string) => operar("delete", () => void datos.delete(clave)),
            clear: () => operar("clear", () => datos.clear()),
          };
        },
      };
      return transaccion;
    },
  };
}

export function instalarIndexedDbFalso(): void {
  const falso = {
    open(nombre: string) {
      const pedido = { result: null, onsuccess: null, onerror: null } as unknown as Pedido<unknown>;
      setTimeout(() => {
        const nueva = !bases.has(nombre);
        if (nueva) bases.set(nombre, new Map());
        pedido.result = crearBase(nombre);
        if (nueva) pedido.onupgradeneeded?.();
        pedido.onsuccess?.();
      });
      return pedido;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", { value: falso, configurable: true });
}
