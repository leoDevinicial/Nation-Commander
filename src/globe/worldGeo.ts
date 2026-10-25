import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import atlasUrl from 'world-atlas/countries-110m.json?url';

/**
 * Geografia de base do globo: Natural Earth 1:110m (domínio público) empacotado pelo
 * `world-atlas` (ISC). Servido como arquivo estático do próprio build — nada é baixado de
 * terceiros em tempo de execução. Fronteiras simplificadas: não é cartografia exata.
 */
export interface WorldCountry {
  /** ISO 3166-1 numérico (ex.: "076"); pode faltar em territórios sem código. */
  id: string | null;
  name: string;
  /** Anéis de polígonos em [lon, lat]. */
  polygons: Position[][][];
}

export interface WorldGeo {
  countries: WorldCountry[];
  /** Fronteiras entre países (cada aresta uma única vez). */
  borders: Position[][];
  /** Litoral (arestas sem vizinho). */
  coasts: Position[][];
}

type CountriesTopo = Topology<{ countries: GeometryCollection<{ name: string }> }>;

let cache: Promise<WorldGeo> | null = null;

export function loadWorldGeo(): Promise<WorldGeo> {
  cache ??= fetch(atlasUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`world-atlas: HTTP ${r.status}`);
      return r.json() as Promise<CountriesTopo>;
    })
    .then(parseWorld)
    .catch((err: unknown) => {
      cache = null;
      throw err;
    });
  return cache;
}

export function parseWorld(topo: CountriesTopo): WorldGeo {
  const obj = topo.objects.countries;
  const fc = feature(topo, obj);
  const countries: WorldCountry[] = fc.features.map((f) => {
    const g = f.geometry as Polygon | MultiPolygon | null;
    const polygons = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return { id: f.id === undefined ? null : String(f.id), name: f.properties?.name ?? '', polygons };
  });
  const borders = (mesh(topo, obj, (a, b) => a !== b) as MultiLineString).coordinates;
  const coasts = (mesh(topo, obj, (a, b) => a === b) as MultiLineString).coordinates;
  return { countries, borders, coasts };
}
