/**
 * Copia local de los archivos (arquitectura §7), en IndexedDB y por `sha256`. Cada usuario tiene su
 * propia base: otra cuenta en el mismo navegador no ve ni puede borrar estos archivos. Las conexiones
 * se abren y cierran en cada operación, para no trabar a otras pestañas.
 */
const VERSION_BASE = 1;
const ALMACEN = "archivos";

export interface DatosArchivoLocal {
  sha256: string;
  nombre: string;
  mime: string | null;
  bytes: number;
}

export interface ArchivoLocal extends DatosArchivoLocal {
  contenido: Blob;
}

export interface ArchivosLocales {
  guardar(archivo: ArchivoLocal): Promise<void>;
  leer(sha256: string): Promise<ArchivoLocal | null>;
  listar(): Promise<DatosArchivoLocal[]>;
  contar(): Promise<number>;
  borrar(sha256: string): Promise<void>;
  borrarTodo(): Promise<void>;
}

export function nombreDeBase(userId: string): string {
  return `estudia-archivos-${userId}`;
}

function abrirBase(nombre: string): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === "undefined") {
      rechazar(new Error("Este navegador no permite guardar archivos."));
      return;
    }
    const pedido = indexedDB.open(nombre, VERSION_BASE);
    pedido.onupgradeneeded = () => {
      pedido.result.createObjectStore(ALMACEN, { keyPath: "sha256" });
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error ?? new Error("No pude abrir tus archivos."));
  });
}

/** Termina cuando la transacción se confirmó: recién ahí es cierto que se guardó o se borró. */
async function operar<T>(
  nombre: string,
  modo: IDBTransactionMode,
  operacion: (almacen: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const base = await abrirBase(nombre);
  return new Promise<T>((resolver, rechazar) => {
    const transaccion = base.transaction(ALMACEN, modo);
    const fallar = () => {
      base.close();
      rechazar(transaccion.error ?? new Error("No pude acceder a tus archivos."));
    };
    let pedido: IDBRequest<T>;
    try {
      pedido = operacion(transaccion.objectStore(ALMACEN));
    } catch (error) {
      base.close();
      rechazar(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    transaccion.oncomplete = () => {
      base.close();
      resolver(pedido.result);
    };
    transaccion.onerror = fallar;
    transaccion.onabort = fallar;
  });
}

export function archivosDeUsuario(userId: string): ArchivosLocales {
  const nombre = nombreDeBase(userId);
  return {
    async guardar(archivo) {
      await operar(nombre, "readwrite", (almacen) => almacen.put(archivo));
    },
    async leer(sha256) {
      const leido = await operar<ArchivoLocal | undefined>(nombre, "readonly", (almacen) =>
        almacen.get(sha256),
      );
      return leido ?? null;
    },
    async listar() {
      const todos = await operar<ArchivoLocal[]>(nombre, "readonly", (almacen) => almacen.getAll());
      return todos.map(({ sha256, nombre: titulo, mime, bytes }) => ({
        sha256,
        nombre: titulo,
        mime,
        bytes,
      }));
    },
    contar: () => operar(nombre, "readonly", (almacen) => almacen.count()),
    async borrar(sha256) {
      await operar(nombre, "readwrite", (almacen) => almacen.delete(sha256));
    },
    async borrarTodo() {
      await operar(nombre, "readwrite", (almacen) => almacen.clear());
    },
  };
}

export async function calcularSha256(contenido: Blob): Promise<string> {
  const resumen = await crypto.subtle.digest("SHA-256", await contenido.arrayBuffer());
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
