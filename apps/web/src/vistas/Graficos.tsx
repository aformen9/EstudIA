import type { CSSProperties } from "react";
import type {
  BarraDistribucion,
  Plan,
  PromedioArea,
  PromedioCuatrimestre,
  PuntoPromedioEnElTiempo,
} from "@estudia/core";
import { cantidad, formatoFecha, formatoNota } from "../plan/presentacion";
import { Grafico, Marca } from "./Grafico";

type Escala = Pick<Plan, "notaMax">;

function escalaVertical(valores: number[], plan: Escala) {
  const mayor = Math.max(...valores);
  const lo = Math.max(0, Math.floor(Math.min(...valores)) - 1);
  const hi = Math.min(plan.notaMax, Math.ceil(mayor) + (mayor % 1 ? 0 : 1));
  return { lo, hi: Math.max(hi, lo + 2) };
}

/** Valores de las líneas de fondo: de a uno, salvo en una escala grande. */
function lineasDeGrilla(lo: number, hi: number): number[] {
  const paso = Math.max(1, Math.ceil((hi - lo) / 10));
  const lineas: number[] = [];
  for (let v = lo; v <= hi; v += paso) lineas.push(v);
  return lineas;
}

function Grilla({
  valores,
  x1,
  x2,
  y,
}: {
  valores: number[];
  x1: number;
  x2: number;
  y: (v: number) => number;
}) {
  return (
    <>
      {valores.map((v) => (
        <g key={v}>
          <line className="gl" x1={x1} x2={x2} y1={y(v)} y2={y(v)} />
          <text x={x1 - 8} y={y(v) + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
    </>
  );
}

function trazo(puntos: [number, number][]): string {
  return puntos.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function tiempoDe(fecha: string): number {
  return new Date(`${fecha.slice(0, 10)}T00:00:00Z`).getTime();
}

export function GraficoEnElTiempo({
  puntos,
  plan,
}: {
  puntos: PuntoPromedioEnElTiempo[];
  plan: Escala;
}) {
  const [W, H, L, R, T, B] = [1000, 260, 34, 24, 24, 30];
  const iw = W - L - R;
  const ih = H - T - B;
  const primero = puntos[0];
  const ultimo = puntos.at(-1);
  if (!primero || !ultimo) return null;

  const t0 = tiempoDe(primero.fecha);
  const t1 = tiempoDe(ultimo.fecha);
  const x = (fecha: string) => L + ((tiempoDe(fecha) - t0) / Math.max(1, t1 - t0)) * iw;
  const { lo, hi } = escalaVertical(
    puntos.map((p) => p.promedio),
    plan,
  );
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo)) * ih;
  const d = trazo(puntos.map((p) => [x(p.fecha), y(p.promedio)]));

  const anios: number[] = [];
  const anioInicial = new Date(t0).getUTCFullYear();
  const anioFinal = new Date(t1).getUTCFullYear();
  for (let anio = anioInicial; anio <= anioFinal + 1; anio++) anios.push(anio);

  return (
    <Grafico
      nombre="Promedio acumulado en el tiempo"
      resumen={`${cantidad(puntos.length, "nota", "notas")}. Empieza en ${formatoNota(primero.promedio)} el ${formatoFecha(primero.fecha)} y llega a ${formatoNota(ultimo.promedio)} el ${formatoFecha(ultimo.fecha)}.`}
      tabla={{
        columnas: ["Fecha", "Materia", "Nota", "Promedio"],
        filas: puntos.map((p) => [
          formatoFecha(p.fecha),
          p.materia.nombre,
          `${formatoNota(p.nota)}${p.esAplazo ? " (aplazo)" : ""}`,
          formatoNota(p.promedio),
        ]),
      }}
      ancho={W}
      alto={H}
      anchoMinimo={620}
      total={puntos.length}
    >
      <Grilla valores={lineasDeGrilla(lo, hi)} x1={L} x2={W - R} y={y} />
      {anios.map((anio) => {
        const tx = L + ((Date.UTC(anio, 0, 1) - t0) / Math.max(1, t1 - t0)) * iw;
        if (tx < L || tx > W - R) return null;
        return (
          <g key={anio}>
            <line className="gl" x1={tx} x2={tx} y1={T} y2={T + ih} strokeDasharray="3 4" />
            <text x={tx} y={H - 9} textAnchor="middle">
              {anio}
            </text>
          </g>
        );
      })}
      <path
        className="area"
        d={`${d} L${x(ultimo.fecha)},${y(lo)} L${x(primero.fecha)},${y(lo)} Z`}
        fill="var(--chart-soft)"
      />
      <path
        className="line"
        pathLength={1}
        d={d}
        stroke="var(--chart)"
        strokeWidth={2.5}
        fill="none"
      />
      {puntos.map((p, i) => (
        <Marca
          key={i}
          indice={i}
          texto={`${formatoFecha(p.fecha)} · ${p.materia.nombre}: ${formatoNota(p.nota)}${p.esAplazo ? " (aplazo)" : ""}\nPromedio: ${formatoNota(p.promedio)}`}
        >
          <circle className="hit" cx={x(p.fecha)} cy={y(p.promedio)} r={14} fill="transparent" />
          <circle
            className="dot"
            style={{ "--i": Math.min(i, 12) } as CSSProperties}
            cx={x(p.fecha)}
            cy={y(p.promedio)}
            r={i === puntos.length - 1 ? 6 : 3.5}
            fill={p.esAplazo ? "var(--fin)" : "var(--chart)"}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        </Marca>
      ))}
      <text className="val" x={x(ultimo.fecha) - 10} y={y(ultimo.promedio) - 12} textAnchor="end">
        {formatoNota(ultimo.promedio)}
      </text>
    </Grafico>
  );
}

export function GraficoPorCuatrimestre({
  filas,
  plan,
}: {
  filas: PromedioCuatrimestre[];
  plan: Escala;
}) {
  const [W, H, L, R, T, B, pad] = [520, 250, 30, 22, 26, 30, 26];
  const iw = W - L - R;
  const ih = H - T - B;
  const { lo, hi } = escalaVertical(
    filas.map((f) => f.promedio),
    plan,
  );
  const x = (i: number) =>
    filas.length === 1 ? L + iw / 2 : L + pad + (i * (iw - 2 * pad)) / (filas.length - 1);
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo)) * ih;
  const d = trazo(filas.map((f, i) => [x(i), y(f.promedio)]));
  const nombreDe = (f: PromedioCuatrimestre) => `${f.anio}° año ${f.cuatrimestre}° cuat.`;
  const promedios = filas.map((f) => f.promedio);

  return (
    <Grafico
      nombre="Promedio por cuatrimestre"
      resumen={`${cantidad(filas.length, "cuatrimestre", "cuatrimestres")} con notas. El promedio va de ${formatoNota(Math.min(...promedios))} a ${formatoNota(Math.max(...promedios))}.`}
      tabla={{
        columnas: ["Cuatrimestre", "Promedio", "Notas"],
        filas: filas.map((f) => [nombreDe(f), formatoNota(f.promedio), f.n]),
      }}
      ancho={W}
      alto={H}
      total={filas.length}
    >
      <Grilla valores={lineasDeGrilla(lo, hi)} x1={L} x2={W - R} y={y} />
      <path
        className="area"
        d={`${d} L${x(filas.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`}
        fill="var(--chart-soft)"
      />
      <path
        className="line"
        pathLength={1}
        d={d}
        stroke="var(--chart)"
        strokeWidth={2.5}
        fill="none"
      />
      {filas.map((f, i) => (
        <g key={`${f.anio}-${f.cuatrimestre}`}>
          <Marca
            indice={i}
            texto={`${nombreDe(f)}: ${formatoNota(f.promedio)}\n${cantidad(f.n, "nota", "notas")}`}
          >
            <circle className="hit" cx={x(i)} cy={y(f.promedio)} r={16} fill="transparent" />
            <circle
              className="dot"
              style={{ "--i": i } as CSSProperties}
              cx={x(i)}
              cy={y(f.promedio)}
              r={i === filas.length - 1 ? 6 : 4.5}
              fill="var(--chart)"
              stroke="var(--surface)"
              strokeWidth={2.5}
            />
          </Marca>
          <text
            className="val dot"
            style={{ "--i": i } as CSSProperties}
            x={x(i)}
            y={y(f.promedio) - 12}
            textAnchor="middle"
          >
            {formatoNota(f.promedio)}
          </text>
          <text x={x(i)} y={H - 9} textAnchor="middle">
            {`${f.anio}°A ${f.cuatrimestre}°C`}
          </text>
        </g>
      ))}
    </Grafico>
  );
}

export function GraficoDistribucion({ barras }: { barras: BarraDistribucion[] }) {
  const [W, H, L, R, T, B] = [520, 250, 30, 8, 22, 26];
  const iw = W - L - R;
  const ih = H - T - B;
  const bw = iw / Math.max(1, barras.length);
  const mayor = Math.max(0, ...barras.map((b) => b.cantidad));
  const tope = Math.max(2, Math.ceil(mayor / 2) * 2);
  const y = (v: number) => T + ih - (v / tope) * ih;
  const lineas: number[] = [];
  for (let v = 0; v <= tope; v += tope > 8 ? 2 : 1) lineas.push(v);
  const conNotas = barras.filter((b) => b.cantidad > 0);
  const total = conNotas.reduce((suma, b) => suma + b.cantidad, 0);
  const frecuente = conNotas.find((b) => b.cantidad === mayor);
  const textoBarra = (b: BarraDistribucion) =>
    `Nota ${b.nota}: ${b.cantidad} ${b.cantidad === 1 ? "vez" : "veces"}${b.desaprobada ? " (aplazo)" : ""}`;

  return (
    <Grafico
      nombre="Cantidad de notas por valor"
      resumen={
        frecuente
          ? `${cantidad(total, "nota", "notas")}. La más frecuente es ${frecuente.nota}, ${cantidad(frecuente.cantidad, "vez", "veces")}.`
          : "Todavía no hay notas."
      }
      tabla={{
        columnas: ["Nota", "Veces"],
        filas: barras.map((b) => [`${b.nota}${b.desaprobada ? " (aplazo)" : ""}`, b.cantidad]),
      }}
      ancho={W}
      alto={H}
      total={conNotas.length}
    >
      <Grilla valores={lineas} x1={L} x2={W - R} y={y} />
      {barras.map((b, i) => (
        <text key={b.nota} x={L + i * bw + bw / 2} y={H - 7} textAnchor="middle">
          {b.nota}
        </text>
      ))}
      {barras.map((b, i) => {
        if (!b.cantidad) return null;
        const x = L + i * bw + bw * 0.18;
        const w = bw * 0.64;
        return (
          <g key={b.nota}>
            <Marca indice={conNotas.indexOf(b)} texto={textoBarra(b)}>
              <rect
                className="hit"
                x={L + i * bw}
                y={T}
                width={bw}
                height={ih}
                fill="transparent"
              />
              <rect
                className="bar"
                style={{ "--i": i } as CSSProperties}
                x={x}
                y={y(b.cantidad)}
                width={w}
                height={y(0) - y(b.cantidad)}
                rx={5}
                fill={b.desaprobada ? "var(--fin)" : "var(--chart)"}
              />
            </Marca>
            <text className="val" x={x + w / 2} y={y(b.cantidad) - 7} textAnchor="middle">
              {b.cantidad}
            </text>
          </g>
        );
      })}
    </Grafico>
  );
}

export function GraficoPorArea({ filas, plan }: { filas: PromedioArea[]; plan: Escala }) {
  const [W, rh, L, R] = [520, 34, 150, 44];
  const H = filas.length * rh + 6;
  const lleno = W - L - R;
  const mejor = filas[0];
  return (
    <Grafico
      nombre="Promedio por área"
      resumen={
        mejor
          ? `${cantidad(filas.length, "área", "áreas")} con notas. La más alta es ${mejor.area}, con ${formatoNota(mejor.promedio)}.`
          : "Todavía no hay notas."
      }
      tabla={{
        columnas: ["Área", "Promedio", "Notas"],
        filas: filas.map((f) => [f.area, formatoNota(f.promedio), f.n]),
      }}
      ancho={W}
      alto={H}
      total={filas.length}
    >
      {filas.map((f, i) => {
        const y = i * rh + 4;
        const w = (lleno * f.promedio) / plan.notaMax;
        return (
          <g key={f.area}>
            <text
              x={L - 10}
              y={y + rh / 2 + 1}
              textAnchor="end"
              dominantBaseline="middle"
              style={{ fill: "var(--ink-2)", fontWeight: 600 }}
            >
              {f.area}
            </text>
            <Marca
              indice={i}
              texto={`${f.area}: ${formatoNota(f.promedio)} (${cantidad(f.n, "nota", "notas")})`}
            >
              <rect x={L} y={y + 6} width={lleno} height={rh - 14} rx={6} fill="var(--surface-2)" />
              <rect
                className="hbar"
                style={{ "--i": i } as CSSProperties}
                x={L}
                y={y + 6}
                width={w}
                height={rh - 14}
                rx={6}
                fill={i === 0 ? "var(--chart)" : "var(--accent-2)"}
                opacity={i === 0 ? 1 : 0.55}
              />
            </Marca>
            <text className="val" x={L + w + 8} y={y + rh / 2 + 1} dominantBaseline="middle">
              {formatoNota(f.promedio)}
            </text>
          </g>
        );
      })}
    </Grafico>
  );
}
