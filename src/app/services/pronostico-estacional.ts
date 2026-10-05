import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type VariablePronostico = 'lluvia' | 'tmax' | 'tmin';

export interface LimitesRaster {
  oeste: number;
  sur: number;
  este: number;
  norte: number;
}

export interface EscalaRaster {
  nombre: string;
  unidad: string;
  minimo: number;
  maximo: number;
  puntos?: number[];
  colores?: Array<string | number[]>;
}

export interface CapaPronostico {
  id: number;
  fecha_corrida: string | null;
  periodo: string;
  mes: string;
  anio: number;
  variable: VariablePronostico;
  unidad: string;
  resolucion_fuente: string;
  resolucion_archivo: string;
  crs: string | null;
  ancho: number;
  alto: number;
  nodata: number | null;
  limites: LimitesRaster;
  escala: EscalaRaster;
}

export interface RespuestaCapas {
  fecha_corrida: string | null;
  periodos: string[];
  total_capas: number;
  capas: CapaPronostico[];
}

export interface PronosticoMensual {
  periodo: string;
  mes?: string;
  anio?: number;
  lluvia?: number | null;
  tmax?: number | null;
  tmin?: number | null;
}

export interface RespuestaPunto {
  lat: number;
  lon: number;
  fecha_corrida?: string | null;
  uso_suelo?: {
    id?: number;
    clave?: string;
    descripcion?: string;
    fuente?: string;
  } | null;
  pronostico: PronosticoMensual[];
  nota?: string;
}

export interface EstadoPronostico {
  cve_ent: string;
  nombre: string;
  total_municipios: number;
}

export interface RespuestaEstados {
  total: number;
  estados: EstadoPronostico[];
}

export interface MunicipioIdentificado {
  cvegeo: string;
  cve_ent: string;
  cve_mun: string;
  municipio: string;
  estado: string;
}

export interface RespuestaMunicipioPunto {
  lat: number;
  lon: number;
  encontrado: boolean;
  municipio: MunicipioIdentificado | null;
  multiples_coincidencias: boolean;
  nota: string | null;
  fuente: string;
}

export type EstadoDatoMunicipal =
  | 'disponible'
  | 'sin_datos'
  | 'pendiente_calculo'
  | 'sin_capa';

export interface PronosticoMunicipal {
  cvegeo: string;
  cve_ent: string;
  cve_mun: string;
  municipio: string;
  lluvia: number | null;
  tmax: number | null;
  tmin: number | null;
  cobertura_pct: Record<VariablePronostico, number | null>;
  estado_datos: Record<VariablePronostico, EstadoDatoMunicipal>;
}

export interface CapaMunicipal {
  id: number;
  variable: VariablePronostico;
  unidad: string;
  fecha_corrida: string | null;
}

export interface RespuestaMunicipios {
  estado: {
    cve_ent: string;
    nombre: string;
  };
  periodo: string;
  fecha_corrida: string | null;
  total_municipios: number;
  municipios: PronosticoMunicipal[];
  capas: CapaMunicipal[];
  fuente_municipios: string;
  nota: string;
}

@Injectable({
  providedIn: 'root'
})
export class PronosticoEstacionalService {
  private readonly apiUrl =
    '/wrf-api/api/pronostico-estacional';

  constructor(private http: HttpClient) {}

  obtenerCapas(): Observable<RespuestaCapas> {
    return this.http.get<RespuestaCapas>(
      `${this.apiUrl}/capas`
    );
  }

  consultarPunto(
    lat: number,
    lon: number
  ): Observable<RespuestaPunto> {
    const params = new HttpParams()
      .set('lat', lat.toString())
      .set('lon', lon.toString());

    return this.http.get<RespuestaPunto>(
      `${this.apiUrl}/punto`,
      { params }
    );
  }

  obtenerEstados(): Observable<RespuestaEstados> {
    return this.http.get<RespuestaEstados>(
      `${this.apiUrl}/estados`
    );
  }

  obtenerMunicipios(
    cveEnt: string,
    periodo: string
  ): Observable<RespuestaMunicipios> {
    const params = new HttpParams()
      .set('cve_ent', cveEnt)
      .set('periodo', `${periodo.slice(0, 7)}-01`);

    return this.http.get<RespuestaMunicipios>(
      `${this.apiUrl}/municipios`,
      { params }
    );
  }

  consultarMunicipioPunto(
    lat: number,
    lon: number
  ): Observable<RespuestaMunicipioPunto> {
    const params = new HttpParams()
      .set('lat', lat.toString())
      .set('lon', lon.toString());

    return this.http.get<RespuestaMunicipioPunto>(
      `${this.apiUrl}/municipio-punto`,
      { params }
    );
  }

  obtenerUrlImagen(
    variable: VariablePronostico,
    periodo: string
  ): string {
    const mes = periodo.slice(0, 7);

    return `${this.apiUrl}/imagenes/${variable}/${mes}.png`;
  }

  obtenerUrlRaster(capaId: number): string {
    return `${this.apiUrl}/raster/${capaId}.png`;
  }

  obtenerUrlUsoSuelo(): string {
    return `${this.apiUrl}/uso-suelo/{z}/{x}/{y}.pbf`;
  }
}